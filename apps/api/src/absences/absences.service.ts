import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Callup } from '../entities/callup.entity';
import { Absence } from '../entities/absence.entity';
import type { AuthContext } from '../common/auth-context';
import { Club } from '../entities/club.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { AuditAction, CallupResponse, EnrollmentType, NotificationType, ReasonDecline, SeasonStatus } from '../entities/enums';
import { canPlanEvents, editableEvent, localDate } from '../events/event.rules';
import { NotificationsService } from '../notifications/notifications.service';
import { canReadSeasonEvents } from '../events/visibility';
import { ResponsesService } from '../callups/responses.service';
import type { AbsenceDto, DeclineDto } from './dto';
import { covers, declinable, mergePeriods, validatePeriod, type Period } from './absence.rules';

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

export interface MyEnrollmentAbsences {
  enrollmentId: string;
  type: EnrollmentType;
  teamName: string;
  seasonName: string;
  seasonStatus: SeasonStatus;
  seasonStart: string;
  seasonEnd: string;
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
    return enrollments.map((e) => ({
      enrollmentId: e.id,
      type: e.type,
      teamName: e.season.team.name,
      seasonName: e.season.name,
      seasonStatus: e.season.status,
      seasonStart: e.season.startDate,
      seasonEnd: e.season.endDate,
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

    const own = a.personId ? await this.em.find(Enrollment, { person: a.personId, season: enrollment.season.id }, { fields: ['type'] }) : [];
    const season = { id: enrollment.season.id, activityId: enrollment.season.team.activity.id, teamId: enrollment.season.team.id };
    const reads = own.some((e) => e.type === EnrollmentType.STAFF) || canReadSeasonEvents(a.roles, [], season);
    if (!reads) throw permissionDenied();
    return { editable: false, absences: mergePeriods(rows.map(period)) };
  }

  async create(a: AuthContext, enrollmentId: string, dto: AbsenceDto): Promise<AbsenceResult> {
    const enrollment = await this.ownEnrollment(a, enrollmentId);
    const p = this.checked(enrollment, dto);
    const absence = this.em.create(Absence, { club: a.clubId as string, enrollment, startDate: p.startDate, endDate: p.endDate });
    await this.em.flush();
    await this.notifyStaff(a, enrollment, absence);
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
  private async notifyStaff(a: AuthContext, enrollment: Enrollment, absence: Absence): Promise<void> {
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
      from: absence.startDate,
      ...(absence.endDate ? { until: absence.endDate } : {}),
    };
    await this.notifications.notify({
      clubId: a.clubId as string,
      userIds: [...users.keys()],
      type: NotificationType.ABSENCE_DECLARED,
      params,
      dedupKey: `absence:${absence.id}`,
    });
  }
}
