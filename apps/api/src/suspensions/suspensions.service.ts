import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth-context';
import { Enrollment } from '../entities/enrollment.entity';
import { AuditAction, EnrollmentType, EventType, SeasonStatus, SuspensionForm } from '../entities/enums';
import { Event } from '../entities/event.entity';
import { Season } from '../entities/season.entity';
import { Suspension } from '../entities/suspension.entity';
import { localDate } from '../events/event.rules';
import { canReadSeasonEvents } from '../events/visibility';
import { AuthorizationsService } from '../permissions/authorizations.service';
import type { CreateSuspensionDto, SuspensionDto } from './dto';
import { loadMatches, loadSuspensions, suspensionData } from './suspension.loader';
import { coverage, normalizeCompetitions, validateSuspension, type CoveredMatch, type MatchInfo, type SuspensionData } from './suspension.rules';

export interface SuspensionOut {
  id: string;
  enrollmentId: string;
  form: SuspensionForm;
  startDate: string;
  matchCount: number | null;
  endDate: string | null;
  competitions: string[];
  originEventId: string | null;
  /** The matches covered now, in calendar order, computed from the calendar and never stored. */
  covered: CoveredMatch[];
  served: number;
  remaining: number;
  completed: boolean;
}

export interface SeasonSuspensionOut extends SuspensionOut {
  personId: string;
  name: string;
  surname: string | null;
  type: EnrollmentType;
}

/** What the team screen needs to write: the season, who can be suspended and whether the reader may record. */
export interface SuspensionContext {
  seasonName: string;
  teamName: string;
  status: SeasonStatus;
  seasonStart: string;
  seasonEnd: string;
  canManage: boolean;
  people: { enrollmentId: string; name: string; surname: string | null; type: EnrollmentType }[];
}

export interface MyEnrollmentSuspensions {
  enrollmentId: string;
  type: EnrollmentType;
  teamName: string;
  seasonName: string;
  seasonStatus: SeasonStatus;
  suspensions: SuspensionOut[];
}

const enrollmentNotFound = () => new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
const suspensionNotFound = () => new NotFoundException({ message: 'Suspension not found', code: 'SUSPENSION_NOT_FOUND' });
const permissionDenied = () => new ForbiddenException({ message: 'You do not have permission for this operation', code: 'PERMISSION_DENIED' });
const invalidData = () => new BadRequestException({ message: 'Invalid data', code: 'INVALID_DATA' });

const outOf = (s: Suspension, matches: readonly MatchInfo[], now: Date): SuspensionOut => {
  const c = coverage(suspensionData(s), matches, now);
  return {
    id: s.id,
    enrollmentId: s.enrollment.id,
    form: s.form,
    startDate: s.startDate,
    matchCount: s.matchCount,
    endDate: s.endDate,
    competitions: s.competitions,
    originEventId: s.originEvent?.id ?? null,
    covered: c.covered,
    served: c.served,
    remaining: c.remaining,
    completed: c.completed,
  };
};

const byStart = (a: { startDate: string }, b: { startDate: string }) => a.startDate.localeCompare(b.startDate);

/**
 * Suspensions (slice 5, rule 13). Check order: the record exists in the club (404), the person may (403), the season is
 * not closed (409), then the data (400). Only who holds the `suspensions.manage` policy in the team writes, and never on
 * their own enrollment. Served and remaining matches are computed from the calendar on every read.
 */
@Injectable()
export class SuspensionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly authz: AuthorizationsService,
    private readonly audit: AuditService,
  ) {}

  /** The open enrollments of the logged in person, in seasons that are not closed, with their suspensions. */
  async mine(a: AuthContext): Promise<MyEnrollmentSuspensions[]> {
    if (!a.personId) return [];
    const enrollments = await this.em.find(
      Enrollment,
      { person: a.personId, endedAt: null, season: { status: { $in: [SeasonStatus.ACTIVE, SeasonStatus.DRAFT] } } },
      { populate: ['season.team'], orderBy: { season: { startDate: 'desc' } } },
    );
    const bySeason = new Map<string, MatchInfo[]>();
    for (const e of enrollments) if (!bySeason.has(e.season.id)) bySeason.set(e.season.id, await loadMatches(this.em, e.season.id));
    const grouped = await loadSuspensions(this.em, enrollments.map((e) => e.id));
    const now = new Date();
    return enrollments.map((e) => ({
      enrollmentId: e.id,
      type: e.type,
      teamName: e.season.team.name,
      seasonName: e.season.name,
      seasonStatus: e.season.status,
      suspensions: (grouped.get(e.id) ?? []).map((s) => outOf(s, bySeason.get(e.season.id) ?? [], now)).sort(byStart),
    }));
  }

  /** Everybody who reads the team's suspensions: the staff of the season, managers in scope and the admin. Not players. */
  async ofSeason(a: AuthContext, seasonId: string): Promise<SeasonSuspensionOut[]> {
    const target = await this.authz.target(a.clubId as string, { seasonId }); // 404 SEASON_NOT_FOUND
    await this.assertReads(a, { id: seasonId, activityId: target.activityId as string, teamId: target.teamId as string });
    const enrollments = await this.em.find(Enrollment, { season: seasonId }, { populate: ['person'] });
    const grouped = await loadSuspensions(this.em, enrollments.map((e) => e.id));
    const matches = await loadMatches(this.em, seasonId);
    const now = new Date();
    return enrollments
      .flatMap((e) =>
        (grouped.get(e.id) ?? []).map((s) => ({ ...outOf(s, matches, now), personId: e.person.id, name: e.person.name, surname: e.person.surname, type: e.type })),
      )
      .sort(byStart);
  }

  /**
   * For the team screen, to who reads the season's suspensions. `canManage` is for the UI only (policy in the team and the
   * season not closed): the writes check again. The reader is left out of the people, nobody records on themselves.
   */
  async context(a: AuthContext, seasonId: string): Promise<SuspensionContext> {
    const target = await this.authz.target(a.clubId as string, { seasonId }); // 404 SEASON_NOT_FOUND
    await this.assertReads(a, { id: seasonId, activityId: target.activityId as string, teamId: target.teamId as string });
    const season = await this.em.findOneOrFail(Season, { id: seasonId }, { populate: ['team'] });
    const canManage = season.status !== SeasonStatus.CLOSED && (await this.authz.can(a, 'suspensions.manage', { seasonId }));
    const enrollments = await this.em.find(Enrollment, { season: seasonId, endedAt: null, person: { disabledAt: null } }, { populate: ['person'] });
    const people = enrollments
      .filter((e) => e.person.id !== a.personId)
      .map((e) => ({ enrollmentId: e.id, name: e.person.name, surname: e.person.surname, type: e.type }))
      .sort((x, y) => (x.surname ?? '').localeCompare(y.surname ?? '') || x.name.localeCompare(y.name));
    return { seasonName: season.name, teamName: season.team.name, status: season.status, seasonStart: season.startDate, seasonEnd: season.endDate, canManage, people };
  }

  /** The owner reads their own; the staff of the season, managers in scope and the admin read the whole enrollment. */
  async list(a: AuthContext, enrollmentId: string): Promise<{ suspensions: SuspensionOut[] }> {
    const enrollment = await this.em.findOne(Enrollment, { id: enrollmentId }, { populate: ['person', 'season.team'] });
    if (!enrollment) throw enrollmentNotFound();
    if (a.personId !== enrollment.person.id) {
      await this.assertReads(a, { id: enrollment.season.id, activityId: enrollment.season.team.activity.id, teamId: enrollment.season.team.id });
    }
    const grouped = await loadSuspensions(this.em, [enrollment.id]);
    const matches = await loadMatches(this.em, enrollment.season.id);
    const now = new Date();
    return { suspensions: (grouped.get(enrollment.id) ?? []).map((s) => outOf(s, matches, now)).sort(byStart) };
  }

  async create(a: AuthContext, enrollmentId: string, dto: CreateSuspensionDto): Promise<SuspensionOut> {
    const enrollment = await this.em.findOne(Enrollment, { id: enrollmentId, endedAt: null }, { populate: ['person', 'season.team'] });
    if (!enrollment) throw enrollmentNotFound();
    await this.mayWrite(a, enrollment);

    let origin: Event | null = null;
    if (dto.originEventId) {
      if (dto.form !== SuspensionForm.MATCHES) throw invalidData();
      origin = await this.em.findOne(Event, { id: dto.originEventId, season: enrollment.season.id, type: EventType.MATCH });
      if (!origin) throw new BadRequestException({ message: 'The origin must be a match of the season', code: 'INVALID_ORIGIN' });
    }
    const data = this.checked(enrollment, dto, origin ? localDate(origin.start) : null, origin?.start ?? null);

    const suspension = this.em.create(Suspension, {
      club: a.clubId as string,
      enrollment,
      form: data.form,
      startDate: data.startDate,
      matchCount: data.matchCount,
      endDate: data.endDate,
      competitions: [...data.competitions],
      originEvent: origin,
    });
    await this.em.flush();
    await this.audit.register({ action: AuditAction.SUSPENSION_CREATED, ...this.trail(a, suspension) });
    return outOf(suspension, await loadMatches(this.em, enrollment.season.id), new Date());
  }

  /** Replaces the data of the suspension. The origin stays only while the suspension keeps its form and its start. */
  async update(a: AuthContext, id: string, dto: SuspensionDto): Promise<SuspensionOut> {
    const suspension = await this.load(id);
    await this.mayWrite(a, suspension.enrollment);
    const keepsOrigin = suspension.originEvent !== null && dto.form === SuspensionForm.MATCHES && dto.startDate === suspension.startDate;
    const data = this.checked(suspension.enrollment, dto, null, null);

    suspension.form = data.form;
    suspension.startDate = data.startDate;
    suspension.matchCount = data.matchCount;
    suspension.endDate = data.endDate;
    suspension.competitions = [...data.competitions];
    if (!keepsOrigin) suspension.originEvent = null;
    await this.em.flush();
    await this.audit.register({ action: AuditAction.SUSPENSION_MODIFIED, ...this.trail(a, suspension) });
    return outOf(suspension, await loadMatches(this.em, suspension.enrollment.season.id), new Date());
  }

  async cancel(a: AuthContext, id: string): Promise<void> {
    const suspension = await this.load(id);
    await this.mayWrite(a, suspension.enrollment);
    const trail = this.trail(a, suspension);
    this.em.remove(suspension);
    await this.em.flush();
    await this.audit.register({ action: AuditAction.SUSPENSION_CANCELLED, ...trail });
  }

  private async load(id: string): Promise<Suspension> {
    const suspension = await this.em.findOne(Suspension, { id }, { populate: ['originEvent', 'enrollment.person', 'enrollment.season.team'] });
    if (!suspension || suspension.enrollment.endedAt !== null) throw suspensionNotFound();
    return suspension;
  }

  /** 403 without the policy in the team or on one's own enrollment, 409 in a closed season. */
  private async mayWrite(a: AuthContext, enrollment: Enrollment): Promise<void> {
    await this.authz.request(a, 'suspensions.manage', { enrollmentId: enrollment.id });
    if (a.personId && a.personId === enrollment.person.id) throw permissionDenied();
    if (enrollment.season.status === SeasonStatus.CLOSED) throw new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });
  }

  /** Staff of the season, managers in scope and the admin. Players and the staff of other teams are refused. */
  private async assertReads(a: AuthContext, season: { id: string; activityId: string; teamId: string }): Promise<void> {
    const own = a.personId ? await this.em.find(Enrollment, { person: a.personId, season: season.id }, { fields: ['type'] }) : [];
    if (own.some((e) => e.type === EnrollmentType.STAFF) || canReadSeasonEvents(a.roles, [], season)) return;
    throw permissionDenied();
  }

  /** The data of the request as the rules need it, or the matching 400. `originDay` and `originStart` come from a match the suspension is born from. */
  private checked(enrollment: Enrollment, dto: SuspensionDto, originDay: string | null, originStart: Date | null): SuspensionData {
    const startDate = originDay ?? dto.startDate;
    if (startDate === undefined) throw invalidData();
    const data: SuspensionData = {
      form: dto.form,
      startDate,
      matchCount: dto.matchCount ?? null,
      endDate: dto.endDate ?? null,
      competitions: normalizeCompetitions(dto.competitions ?? []),
      originStart,
    };
    const verdict = validateSuspension(data, enrollment.season);
    if (verdict === 'INVALID_DATA') throw invalidData();
    if (verdict === 'SUSPENSION_OUTSIDE_SEASON') {
      throw new BadRequestException({ message: 'The suspension must fall inside the season', code: 'SUSPENSION_OUTSIDE_SEASON' });
    }
    return data;
  }

  /** Dates and counts in the audit: no names, no free text, there is none. */
  private trail(a: AuthContext, x: Suspension) {
    return {
      userId: a.userId,
      clubId: a.clubId,
      entity: 'suspension',
      entityId: x.id,
      meta: {
        enrollmentId: x.enrollment.id,
        form: x.form,
        startDate: x.startDate,
        matchCount: x.matchCount,
        endDate: x.endDate,
        competitions: x.competitions,
        originEventId: x.originEvent?.id ?? null,
      },
    };
  }
}
