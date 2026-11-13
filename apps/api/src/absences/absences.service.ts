import { randomUUID } from 'node:crypto';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Callup } from '../entities/callup.entity';
import { Absence } from '../entities/absence.entity';
import type { AuthContext } from '../common/auth-context';
import { Club } from '../entities/club.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { Season } from '../entities/season.entity';
import { AuditAction, CallupResponse, EnrollmentStatus, EnrollmentType, NotificationType, ReasonDecline, SeasonStatus, StaffRole } from '../entities/enums';
import { canPlanEvents, editableEvent, localDate } from '../events/event.rules';
import { NotificationsService } from '../notifications/notifications.service';
import { canReadRoster } from '../events/visibility';
import { ResponsesService } from '../callups/responses.service';
import { currentByPerson } from '../people/expected-injury.loader';
import type { ExpectedPeriod } from '../people/expected-injury.rules';
import type { AbsenceDto, DeclineDto } from './dto';
import { covers, declinable, freeDays, mergePeriods, validatePeriod, type Period } from './absence.rules';

export interface AbsenceOut {
  id: string;
  startDate: string;
  endDate: string | null;
}

/** An event already answered by the person (call-up or availability) that the absence now covers. */
export interface AffectedEvent {
  eventId: string;
  type: string;
  title: string | null;
  start: Date;
  response: CallupResponse;
}

export interface AbsenceResult {
  absence: AbsenceOut;
  affected: AffectedEvent[];
}

/** A person of the season who declared absences, dates only and merged, for the staff screen. */
export interface SeasonAbsences {
  enrollmentId: string;
  personId: string;
  name: string;
  surname: string | null;
  type: EnrollmentType;
  staffRole: StaffRole | null;
  absences: Period[];
}

export interface MyEnrollmentAbsences {
  enrollmentId: string;
  type: EnrollmentType;
  teamName: string;
  seasonName: string;
  seasonStatus: SeasonStatus;
  seasonStart: string;
  seasonEnd: string;
  /** Players only: the person's own state and the expected injury still running (#21). Staff get `available` and null. */
  status: EnrollmentStatus;
  expectedInjury: ExpectedPeriod | null;
  absences: AbsenceOut[];
}

const enrollmentNotFound = () => new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
const absenceNotFound = () => new NotFoundException({ message: 'Absence not found', code: 'ABSENCE_NOT_FOUND' });
const permissionDenied = () => new ForbiddenException({ message: 'You do not have permission for this operation', code: 'PERMISSION_DENIED' });
const out = (x: Absence): AbsenceOut => ({ id: x.id, startDate: x.startDate, endDate: x.endDate });
const period = (x: Pick<Absence, 'startDate' | 'endDate'>): Period => ({ startDate: x.startDate, endDate: x.endDate });
const byStart = (a: AbsenceOut, b: AbsenceOut) => a.startDate.localeCompare(b.startDate);

/**
 * Declared absences (slice 5, rule 10). Check order: the record exists in the club (404), the person may (403), the season
 * is open (409), then the data (400). Only the person concerned writes; there is no policy for it, not even for the admin.
 */
@Injectable()
export class AbsencesService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly responses: ResponsesService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The open enrollments of the logged in person, in seasons that are not closed, with their absences as entered. */
  async mine(a: AuthContext): Promise<MyEnrollmentAbsences[]> {
    if (!a.personId) return [];
    const enrollments = await this.em.find(
      Enrollment,
      { person: a.personId, endedAt: null, season: { status: { $in: [SeasonStatus.ACTIVE, SeasonStatus.DRAFT] } } },
      { populate: ['season.team'], orderBy: { season: { startDate: 'desc' } } },
    );
    const rows = await this.em.find(Absence, { enrollment: { $in: enrollments.map((e) => e.id) } });
    const expected = enrollments.some((e) => e.type === EnrollmentType.PLAYER) ? (await currentByPerson(this.em, [a.personId])).get(a.personId) ?? null : null;
    // The dates of an expected injury are health data (art. 9): the person's own read is audited too, never the dates.
    if (expected) await this.audit.register({ action: AuditAction.EXPECTED_INJURY_READ, userId: a.userId, clubId: a.clubId, entity: 'Person', entityId: a.personId });
    return enrollments.map((e) => ({
      enrollmentId: e.id,
      type: e.type,
      teamName: e.season.team.name,
      seasonName: e.season.name,
      seasonStatus: e.season.status,
      seasonStart: e.season.startDate,
      seasonEnd: e.season.endDate,
      status: e.type === EnrollmentType.PLAYER ? e.status : EnrollmentStatus.AVAILABLE,
      expectedInjury: e.type === EnrollmentType.PLAYER ? expected : null,
      absences: rows.filter((r) => r.enrollment.id === e.id).map(out).sort(byStart),
    }));
  }

  /**
   * The owner reads their absences as entered, with ids. The staff of the season, managers in scope and the admin read
   * the dates only, fused where they touch, in read only. Players of the team and everybody else are refused.
   */
  async list(a: AuthContext, enrollmentId: string): Promise<{ editable: boolean; absences: (Period & { id?: string })[] }> {
    const enrollment = await this.em.findOne(Enrollment, { id: enrollmentId }, { populate: ['person', 'season.team'] });
    if (!enrollment) throw enrollmentNotFound();
    const rows = await this.em.find(Absence, { enrollment: enrollment.id });
    if (a.personId === enrollment.person.id) return { editable: true, absences: rows.map(out).sort(byStart) };

    await this.assertReadsRoster(a, enrollment.season);
    return { editable: false, absences: mergePeriods(rows.map(period)) };
  }

  /**
   * Who is away in the team, for the staff of the season, managers in scope and the admin; players of the team are refused.
   * Dates only, merged where they touch. People who left the team or are disabled are left out, as are those with nothing
   * declared. Soonest start first. Past absences are the screen's to fold away.
   */
  async ofSeason(a: AuthContext, seasonId: string): Promise<SeasonAbsences[]> {
    const season = await this.em.findOne(Season, { id: seasonId }, { populate: ['team'] });
    if (!season) throw new NotFoundException({ message: 'Season not found', code: 'SEASON_NOT_FOUND' });
    await this.assertReadsRoster(a, season);
    const enrollments = await this.em.find(Enrollment, { season: seasonId, endedAt: null, person: { disabledAt: null } }, { populate: ['person'] });
    const rows = await this.em.find(Absence, { enrollment: { $in: enrollments.map((e) => e.id) } });
    return enrollments
      .map((e) => ({
        enrollmentId: e.id,
        personId: e.person.id,
        name: e.person.name,
        surname: e.person.surname,
        type: e.type,
        staffRole: e.staffRole,
        absences: mergePeriods(rows.filter((r) => r.enrollment.id === e.id).map(period)),
      }))
      .filter((r) => r.absences.length > 0)
      .sort((x, y) => (x.absences[0] as Period).startDate.localeCompare((y.absences[0] as Period).startDate) || x.enrollmentId.localeCompare(y.enrollmentId));
  }

  async create(a: AuthContext, enrollmentId: string, dto: AbsenceDto): Promise<AbsenceResult> {
    const enrollment = await this.ownEnrollment(a, enrollmentId);
    const p = this.checked(enrollment, dto);
    const absence = this.em.create(Absence, { club: a.clubId as string, enrollment, startDate: p.startDate, endDate: p.endDate });
    await this.em.flush();
    await this.notifyStaff(a, enrollment, NotificationType.ABSENCE_DECLARED, p, `absence:${absence.id}`);
    await this.audit.register({ action: AuditAction.ABSENCE_CREATED, ...this.trail(a, absence) });
    return { absence: out(absence), affected: await this.affected(enrollment, p) };
  }

  async update(a: AuthContext, id: string, dto: AbsenceDto): Promise<AbsenceResult> {
    const absence = await this.ownAbsence(a, id);
    const p = this.checked(absence.enrollment, dto);
    absence.startDate = p.startDate;
    absence.endDate = p.endDate;
    await this.em.flush();
    await this.audit.register({ action: AuditAction.ABSENCE_MODIFIED, ...this.trail(a, absence) });
    return { absence: out(absence), affected: await this.affected(absence.enrollment, p) };
  }

  async cancel(a: AuthContext, id: string): Promise<void> {
    const absence = await this.ownAbsence(a, id);
    const trail = this.trail(a, absence);
    this.em.remove(absence);
    await this.em.flush();
    await this.audit.register({ action: AuditAction.ABSENCE_CANCELLED, ...trail });
  }

  /**
   * Frees days from today onward in the declared periods of the enrollment (issue 25): every period the range touches is
   * shortened, split or removed in one transaction, and the result is the list as the owner now reads it. Injury and
   * suspension are other blocks and are never touched; answers already declined stay declined. The staff are told once per
   * operation, with the days asked, and nothing at all when the range touched nothing.
   */
  async free(a: AuthContext, enrollmentId: string, dto: AbsenceDto): Promise<{ absences: AbsenceOut[] }> {
    const enrollment = await this.ownEnrollment(a, enrollmentId);
    const rows = await this.em.find(Absence, { enrollment: enrollment.id });
    const range = { from: dto.startDate, to: dto.endDate ?? null };
    const plan = freeDays(rows.map((r) => ({ id: r.id, ...period(r) })), range, localDate(new Date()));
    if ('error' in plan) {
      throw plan.error === 'ABSENCE_DAYS_IN_PAST'
        ? new BadRequestException({ message: 'Only days from today can be freed', code: 'ABSENCE_DAYS_IN_PAST' })
        : new BadRequestException({ message: 'Invalid data', code: 'INVALID_DATA' });
    }
    if (plan.updates.length + plan.creates.length + plan.removes.length === 0) return { absences: rows.map(out).sort(byStart) };

    const touched: { action: AuditAction; absence: Absence }[] = [];
    for (const u of plan.updates) {
      const row = rows.find((r) => r.id === u.id) as Absence;
      row.startDate = u.startDate;
      row.endDate = u.endDate;
      touched.push({ action: AuditAction.ABSENCE_MODIFIED, absence: row });
    }
    const removed = plan.removes.map((id) => rows.find((r) => r.id === id) as Absence);
    const gone = removed.map((row) => ({ action: AuditAction.ABSENCE_CANCELLED, trail: this.trail(a, row) }));
    for (const row of removed) this.em.remove(row);
    for (const c of plan.creates) {
      touched.push({ action: AuditAction.ABSENCE_CREATED, absence: this.em.create(Absence, { club: a.clubId as string, enrollment, startDate: c.startDate, endDate: c.endDate }) });
    }
    await this.em.flush();

    for (const t of touched) await this.audit.register({ action: t.action, ...this.trail(a, t.absence) });
    for (const g of gone) await this.audit.register({ action: g.action, ...g.trail });
    await this.notifyStaff(a, enrollment, NotificationType.ABSENCE_FREED, { startDate: range.from, endDate: range.to }, `absence-freed:${enrollment.id}:${randomUUID()}`);
    const left = rows.filter((r) => !plan.removes.includes(r.id)).concat(touched.filter((t) => t.action === AuditAction.ABSENCE_CREATED).map((t) => t.absence));
    return { absences: left.map(out).sort(byStart) };
  }

  /**
   * Declines the events the person listed, and only those. Each must be an answer of theirs inside this absence, still
   * open; an event already declined is left as it is. If one does not qualify nothing is declined at all.
   */
  async decline(a: AuthContext, id: string, dto: DeclineDto): Promise<{ declined: string[] }> {
    const absence = await this.ownAbsence(a, id);
    const asked = [...new Set(dto.eventIds)];
    const p = period(absence);
    const rows = await this.answers(absence.enrollment);
    const inside = new Set(rows.filter((r) => covers(p, r.day) && (r.open || r.response === CallupResponse.DECLINED)).map((r) => r.eventId));
    if (!asked.every((e) => inside.has(e))) {
      throw new BadRequestException({ message: 'An event is not covered by the absence', code: 'EVENT_NOT_IN_ABSENCE' });
    }

    const player = absence.enrollment.type === EnrollmentType.PLAYER;
    const todo = declinable(rows, p).filter((r) => asked.includes(r.eventId));
    for (const r of todo) {
      const answer = { response: CallupResponse.DECLINED, ...(player ? { reason: ReasonDecline.NOT_AVAILABLE } : {}) };
      await (player ? this.responses.answerAsPlayer(a, r.eventId, answer) : this.responses.answerAsStaff(a, r.eventId, answer));
    }
    return { declined: asked };
  }

  private async assertReadsRoster(a: AuthContext, season: Season): Promise<void> {
    const own = a.personId ? await this.em.find(Enrollment, { person: a.personId, season: season.id }, { fields: ['type'] }) : [];
    const target = { id: season.id, activityId: season.team.activity.id, teamId: season.team.id };
    if (!canReadRoster(a.roles, own.map((e) => e.type), target)) throw permissionDenied();
  }

  /** Dates in range for the season of the enrollment, or the matching 400. */
  private checked(enrollment: Enrollment, dto: AbsenceDto): Period {
    const p: Period = { startDate: dto.startDate, endDate: dto.endDate ?? null };
    const verdict = validatePeriod(p, enrollment.season);
    if (verdict === 'INVALID_DATA') throw new BadRequestException({ message: 'Invalid data', code: 'INVALID_DATA' });
    if (verdict === 'ABSENCE_OUTSIDE_SEASON') {
      throw new BadRequestException({ message: 'The absence must fall inside the season', code: 'ABSENCE_OUTSIDE_SEASON' });
    }
    return p;
  }

  /** The open enrollment of the logged in person, in a season that is not closed. */
  private async ownEnrollment(a: AuthContext, id: string): Promise<Enrollment> {
    const enrollment = await this.em.findOne(Enrollment, { id, endedAt: null }, { populate: ['person', 'season.team'] });
    if (!enrollment) throw enrollmentNotFound();
    return this.owned(a, enrollment);
  }

  private async ownAbsence(a: AuthContext, id: string): Promise<Absence> {
    const absence = await this.em.findOne(Absence, { id }, { populate: ['enrollment.person', 'enrollment.season.team'] });
    if (!absence) throw absenceNotFound();
    if (absence.enrollment.endedAt !== null) throw enrollmentNotFound();
    await this.owned(a, absence.enrollment);
    return absence;
  }

  private owned(a: AuthContext, enrollment: Enrollment): Enrollment {
    if (!a.personId || a.personId !== enrollment.person.id) throw permissionDenied();
    if (enrollment.season.status === SeasonStatus.CLOSED) throw new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });
    return enrollment;
  }

  /** The person's answers to events (call-ups, or availability for staff) with the local day of each event. */
  private async answers(enrollment: Enrollment) {
    const callups = await this.em.find(Callup, { enrollment: enrollment.id }, { populate: ['event.season'] });
    return callups.map((c) => ({
      eventId: c.event.id,
      day: localDate(c.event.start),
      response: c.response,
      open: editableEvent(c.event.status) && canPlanEvents(c.event.season.status),
      type: c.event.type as string,
      title: c.event.title,
      start: c.event.start,
    }));
  }

  /** The answers already given to events the period now covers, soonest first. */
  private async affected(enrollment: Enrollment, p: Period): Promise<AffectedEvent[]> {
    const rows = declinable(await this.answers(enrollment), p);
    return rows.sort((x, y) => x.start.getTime() - y.start.getTime()).map((r) => ({ eventId: r.eventId, type: r.type, title: r.title, start: r.start, response: r.response }));
  }

  /** Dates only in the audit: never a reason, there is none. */
  private trail(a: AuthContext, x: Absence) {
    return {
      userId: a.userId,
      clubId: a.clubId,
      entity: 'absence',
      entityId: x.id,
      meta: { enrollmentId: x.enrollment.id, startDate: x.startDate, endDate: x.endDate },
    };
  }

  /**
   * Notifies the staff of the season, the person excluded. Params hold the club, the name and the dates: no reason,
   * nothing a lock screen should not show.
   */
  private async notifyStaff(a: AuthContext, enrollment: Enrollment, type: NotificationType, days: Period, dedupKey: string): Promise<void> {
    const staff = await this.em.find(
      Enrollment,
      { season: enrollment.season.id, type: EnrollmentType.STAFF, endedAt: null, id: { $ne: enrollment.id }, person: { disabledAt: null, user: { $ne: null } } },
      { populate: ['person.user'] },
    );
    const users = new Map(staff.map((s) => [(s.person.user as NonNullable<typeof s.person.user>).id, s.person.user as NonNullable<typeof s.person.user>]));
    users.delete(a.userId);
    if (users.size === 0) return;
    const club = await this.em.findOneOrFail(Club, a.clubId as string, { fields: ['name'] });
    const params: Record<string, string> = {
      club: club.name,
      person: [enrollment.person.name, enrollment.person.surname].filter(Boolean).join(' '),
      from: days.startDate,
      ...(days.endDate ? { until: days.endDate } : {}),
    };
    await this.notifications.notify({
      clubId: a.clubId as string,
      userIds: [...users.keys()],
      type,
      params,
      dedupKey,
    });
  }
}
