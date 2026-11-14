import { EntityManager } from '@mikro-orm/postgresql';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { disabledMask } from '../attendance/attendance.rules';
import type { AuthContext } from '../common/auth-context';
import { Absence } from '../entities/absence.entity';
import { Attendance } from '../entities/attendance.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { AuditAction, EnrollmentType, SeasonStatus } from '../entities/enums';
import { Season } from '../entities/season.entity';
import { canReadSeasonEvents } from '../events/visibility';
import { localDate } from '../events/event.rules';
import { coverage } from '../suspensions/suspension.rules';
import { loadMatches, loadSuspensions, suspensionData } from '../suspensions/suspension.loader';
import { countOutcomes, declaredDays, statisticsView, totalsOf, type OutcomeCounts, type StatisticsView } from './statistics.rules';

/** The figures of one player in one season. Health data (art. 9) stays a count: `injured` has no dates and no cause. */
export interface StatisticsRow extends OutcomeCounts {
  enrollmentId: string;
  name: string | null;
  surname: string | null;
  /** The person is disabled: the row stays for the totals, the name only for the admin (rule 12). */
  disabled: boolean;
  /** Days of declared absence up to today, each day once. */
  absenceDays: number;
  /** Matches already played that a suspension covered. */
  suspendedMatches: number;
}

export type StatisticsTotals = OutcomeCounts & { absenceDays: number; suspendedMatches: number };

export interface SeasonStatistics {
  view: Exclude<StatisticsView, 'none'>;
  teamName: string;
  seasonName: string;
  seasonStatus: SeasonStatus;
  /** Every player: `full` only. */
  rows: StatisticsRow[];
  /** The whole team: `full` and `totals`. */
  totals: StatisticsTotals | null;
  /** The reader's own row, when they are a player of the season. */
  mine: StatisticsRow | null;
}

export interface OwnStatistics {
  seasonId: string;
  teamName: string;
  seasonName: string;
  seasonStatus: SeasonStatus;
  mine: StatisticsRow;
}

const permissionDenied = () => new ForbiddenException({ message: 'You do not have permission for this operation', code: 'PERMISSION_DENIED' });
const seasonNotFound = () => new NotFoundException({ message: 'Season not found', code: 'SEASON_NOT_FOUND' });
const enrollmentNotFound = () => new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
const bySurname = (x: StatisticsRow, y: StatisticsRow) =>
  (x.surname ?? '￿').localeCompare(y.surname ?? '￿') || (x.name ?? '').localeCompare(y.name ?? '') || x.enrollmentId.localeCompare(y.enrollmentId);

/**
 * Season statistics: derived on every read from attendance, declared absences and suspensions, so a
 * correction shows at once. Staff of the season and the admin read every player, managers in scope the team totals, a
 * player only their own figures. Every read is audited with the season and the view, never the figures.
 */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  async ofSeason(a: AuthContext, seasonId: string): Promise<SeasonStatistics> {
    const season = await this.season(seasonId);
    const own = a.personId ? await this.em.find(Enrollment, { person: a.personId, season: seasonId }, { filters: false, fields: ['type', 'endedAt'] }) : [];
    const view = statisticsView({
      isStaff: own.some((e) => e.type === EnrollmentType.STAFF && e.endedAt === null),
      isAdmin: a.isAdmin,
      readsSeason: a.isAdmin || canReadSeasonEvents(a.roles, [], { id: season.id, sectionId: season.team.section?.id ?? null, teamId: season.team.id }),
      isPlayer: own.some((e) => e.type === EnrollmentType.PLAYER),
    });
    if (view === 'none') throw permissionDenied();

    const players = await this.em.find(Enrollment, { season: seasonId, type: EnrollmentType.PLAYER }, { populate: ['person'] });
    const all = await this.rows(season, players, a.isAdmin);
    const mine = all.find((r) => players.some((p) => p.id === r.enrollmentId && p.person.id === a.personId)) ?? null;
    await this.register(a, { seasonId, view });
    return {
      view,
      teamName: season.team.name,
      seasonName: season.name,
      seasonStatus: season.status,
      rows: view === 'full' ? all.sort(bySurname) : [],
      totals: view === 'own' ? null : this.totals(all),
      mine,
    };
  }

  /** One player: the person themselves, or whoever reads every player of the season. A teammate is refused. */
  async ofEnrollment(a: AuthContext, enrollmentId: string): Promise<StatisticsRow> {
    const enrollment = await this.em.findOne(Enrollment, { id: enrollmentId, type: EnrollmentType.PLAYER }, { populate: ['person', 'season.team'] });
    if (!enrollment) throw enrollmentNotFound();
    const season = enrollment.season;
    const isOwn = a.personId !== null && a.personId === enrollment.person.id;
    let view: StatisticsView = 'own';
    if (!isOwn) {
      const staff = a.personId
        ? await this.em.count(Enrollment, { person: a.personId, season: season.id, type: EnrollmentType.STAFF, endedAt: null }, { filters: false })
        : 0;
      view = statisticsView({ isStaff: staff > 0, isAdmin: a.isAdmin, readsSeason: false, isPlayer: false });
      if (view !== 'full') throw permissionDenied();
    }
    const [row] = await this.rows(season, [enrollment], a.isAdmin);
    await this.register(a, { seasonId: season.id, view, enrollmentId });
    return row as StatisticsRow;
  }

  /** The logged in person's own figures in every season they played, closed ones too. Newest season first. */
  async mine(a: AuthContext): Promise<OwnStatistics[]> {
    if (!a.personId) return [];
    const enrollments = await this.em.find(
      Enrollment,
      { person: a.personId, type: EnrollmentType.PLAYER },
      { populate: ['person', 'season.team'], orderBy: { season: { startDate: 'desc' } } },
    );
    if (enrollments.length === 0) return [];
    const out: OwnStatistics[] = [];
    for (const e of enrollments) {
      const [mine] = await this.rows(e.season, [e], a.isAdmin);
      out.push({ seasonId: e.season.id, teamName: e.season.team.name, seasonName: e.season.name, seasonStatus: e.season.status, mine: mine as StatisticsRow });
    }
    await this.register(a, { view: 'own', seasons: out.length });
    return out;
  }

  private async season(id: string): Promise<Season> {
    const season = await this.em.findOne(Season, { id }, { populate: ['team'] });
    if (!season) throw seasonNotFound();
    return season;
  }

  /** The rows of the given player enrollments of one season. Attendance of staff never gets in. */
  private async rows(season: Season, players: readonly Enrollment[], isAdmin: boolean): Promise<StatisticsRow[]> {
    if (players.length === 0) return [];
    const ids = players.map((p) => p.id);
    const marks = await this.em.find(Attendance, { enrollment: { $in: ids } }, { fields: ['enrollment', 'outcome'] });
    const absences = await this.em.find(Absence, { enrollment: { $in: ids } });
    const suspensions = await loadSuspensions(this.em, ids);
    const matches = await loadMatches(this.em, season.id);
    const now = new Date();
    const today = localDate(now);
    return players.map((p) => {
      const counts = countOutcomes(marks.filter((m) => m.enrollment.id === p.id).map((m) => m.outcome));
      const periods = absences.filter((x) => x.enrollment.id === p.id).map((x) => ({ startDate: x.startDate, endDate: x.endDate }));
      const suspendedMatches = (suspensions.get(p.id) ?? []).reduce((n, s) => n + coverage(suspensionData(s), matches, now).served, 0);
      return disabledMask(
        {
          enrollmentId: p.id,
          name: p.person.name as string | null,
          surname: p.person.surname,
          disabled: p.person.disabledAt !== null,
          ...counts,
          absenceDays: declaredDays(periods, season, today),
          suspendedMatches,
        },
        isAdmin,
      );
    });
  }

  private totals(rows: readonly StatisticsRow[]): StatisticsTotals {
    return {
      ...totalsOf(rows),
      absenceDays: rows.reduce((n, r) => n + r.absenceDays, 0),
      suspendedMatches: rows.reduce((n, r) => n + r.suspendedMatches, 0),
    };
  }

  /** Who read what, never the figures: the injured count is health data. */
  private register(a: AuthContext, meta: Record<string, unknown>) {
    return this.audit.register({ action: AuditAction.STATISTICS_READ, userId: a.userId, clubId: a.clubId, entity: 'statistics', entityId: (meta.seasonId as string | undefined) ?? undefined, meta });
  }
}
