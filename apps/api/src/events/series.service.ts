import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Attendance } from '../entities/attendance.entity';
import { Callup } from '../entities/callup.entity';
import { EnrollmentType, EventStatus, EventType, SeasonStatus } from '../entities/enums';
import { EventSeries } from '../entities/event-series.entity';
import { Event } from '../entities/event.entity';
import { Season } from '../entities/season.entity';
import { validIsoDate } from '../structure/season.rules';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthorizationsService } from '../permissions/authorizations.service';
import { CatalogService } from './catalog.service';
import type { CreateSeriesDto, EditSeriesDto } from './dto';
import { CLUB_TIMEZONE, canPlanEvents, insideSeason, localDate } from './event.rules';
import {
  formatRule,
  occurrences,
  parseRule,
  planRegeneration,
  planRemoval,
  seriesIssue,
  seriesOutsideSeason,
  type Occurrence,
  type RemovalPlan,
  type SeriesIssue,
  type SeriesSpec,
  type Weekday,
} from './series.rules';

export interface SeriesDto {
  id: string;
  seasonId: string;
  teamId: string;
  type: EventType;
  title: string | null;
  venue: { id: string; name: string } | null;
  weekdays: Weekday[];
  intervalWeeks: number;
  startDate: string;
  /** Always a day: the end of the season when none was given. */
  endDate: string;
  timeStart: string;
  durationMinutes: number;
  eventCount: number;
}

/** What removing the future sessions of a series does, or would do (the confirmation). */
export interface RemovalDto {
  /** Sessions removed. */
  sessions: number;
  /** Players with a call-up or a response on them, sent or not, each counted once. Not the same as who is notified. */
  players: number;
  /** Sessions of the series that stay: already held, in progress, or with the attendance check open. */
  kept: number;
}

const ISSUES: Record<SeriesIssue, { message: string; code: string }> = {
  weekdays: { message: 'Invalid data', code: 'INVALID_DATA' },
  interval: { message: 'Invalid data', code: 'INVALID_DATA' },
  time: { message: 'Invalid data', code: 'INVALID_DATA' },
  duration: { message: 'Invalid data', code: 'INVALID_DATA' },
  dates: {
    message: 'The series must end on or after the day it starts',
    code: 'INVALID_PERIOD_SERIES',
  },
  empty: {
    message: 'No day of the period matches the chosen weekdays',
    code: 'SERIES_WITHOUT_EVENTS',
  },
};

const invalidData = () => new BadRequestException({ message: 'Invalid data', code: 'INVALID_DATA' });
const outsideSeason = () =>
  new BadRequestException({
    message: 'The series falls outside the season dates',
    code: 'SERIES_OUTSIDE_SEASON',
  });
const seasonClosed = () =>
  new ConflictException({
    message: 'The season is closed',
    code: 'SEASON_CLOSED',
  });

/** Fields of a series after a create or an edit, checked together. */
interface SeriesFields {
  rule: SeriesSpec['rule'];
  startDate: string;
  /** null: until the end of the season. */
  endDate: string | null;
  timeStart: string;
  durationMinutes: number;
}

/**
 * Recurring trainings. A series is a rule that makes real events, so call-ups and attendance stay per event.
 * Editing "only this one" is an event edit (it marks the exception, see `EventsService.edit`); "all future ones" is `edit` here.
 */
@Injectable()
export class SeriesService {
  constructor(
    private readonly em: EntityManager,
    private readonly authz: AuthorizationsService,
    private readonly catalog: CatalogService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(a: AuthContext, teamId: string, dto: CreateSeriesDto): Promise<SeriesDto> {
    await this.authz.request(a, 'events.manage', { teamId });
    const season = await this.em.findOne(Season, { team: teamId, status: SeasonStatus.ACTIVE }, { populate: ['team'] });
    if (!season)
      throw new ConflictException({
        message: 'The team has no active season',
        code: 'NO_ACTIVE_SEASON',
      });

    const fields: SeriesFields = {
      rule: {
        weekdays: dto.weekdays as Weekday[],
        intervalWeeks: dto.intervalWeeks ?? 1,
      },
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      timeStart: dto.timeStart,
      durationMinutes: dto.durationMinutes,
    };
    const wanted = this.check(fields, season);
    const venue = dto.venueId ? await this.catalog.venue(dto.venueId) : null;

    const series = this.em.create(EventSeries, {
      club: a.clubId as string,
      season,
      type: dto.type,
      title: dto.title ?? null,
      rule: formatRule(fields.rule),
      startDate: fields.startDate,
      untilTo: fields.endDate,
      timeStart: fields.timeStart,
      durationMinutes: fields.durationMinutes,
      timezone: CLUB_TIMEZONE,
      venue,
    });
    for (const o of wanted) this.newEvent(series, o);
    await this.em.flush(); // one transaction: the series and all its sessions, or nothing
    return this.toDto(series, wanted.length);
  }

  async get(a: AuthContext, id: string): Promise<SeriesDto> {
    await this.authz.request(a, 'events.manage', { seriesId: id });
    const series = await this.load(id);
    return this.toDto(series, await this.em.count(Event, { series: id }));
  }

  /**
   * "All future ones": the future sessions nobody edited by hand follow the new rule, in place, so their call-ups and
   * attendance stay. Sessions already started, edited by hand, cancelled or postponed are not touched (see `planRegeneration`).
   * A session that falls out of the rule is removed, unless it already has call-ups or attendance: then it stays as an exception.
   */
  async edit(a: AuthContext, id: string, dto: EditSeriesDto): Promise<SeriesDto> {
    await this.authz.request(a, 'events.manage', { seriesId: id });
    const series = await this.load(id);
    if (!canPlanEvents(series.season.status)) throw seasonClosed();
    const current = parseRule(series.rule);
    if (!current) throw new Error(`Series ${id} has a rule that is not weekly`);

    const fields: SeriesFields = {
      rule: {
        weekdays: (dto.weekdays as Weekday[] | undefined) ?? current.weekdays,
        intervalWeeks: dto.intervalWeeks ?? current.intervalWeeks,
      },
      startDate: series.startDate,
      endDate: dto.endDate === undefined ? series.untilTo : dto.endDate,
      timeStart: dto.timeStart ?? series.timeStart,
      durationMinutes: dto.durationMinutes ?? series.durationMinutes,
    };
    const wanted = this.check(fields, series.season, series.timezone);
    if (dto.venueId !== undefined) series.venue = dto.venueId === null ? null : await this.catalog.venue(dto.venueId);
    if (dto.title !== undefined) series.title = dto.title;
    series.rule = formatRule(fields.rule);
    series.untilTo = fields.endDate;
    series.timeStart = fields.timeStart;
    series.durationMinutes = fields.durationMinutes;

    const rows = await this.em.find(Event, { series: id }, { populate: ['venue'] });
    const plan = planRegeneration(
      rows.map((e) => ({
        id: e.id,
        occurrenceDate: e.occurrenceDate as string,
        exception: e.exception,
        status: e.status,
        start: e.start,
      })),
      wanted,
      new Date(),
    );
    const byId = new Map(rows.map((e) => [e.id, e]));
    const moved: string[] = [];
    for (const { id: eventId, occurrence } of plan.update) {
      const e = byId.get(eventId) as Event;
      if (e.start.getTime() !== occurrence.start.getTime() || e.end.getTime() !== occurrence.end.getTime() || e.venue?.id !== (series.venue?.id ?? undefined)) {
        moved.push(e.id);
      }
      e.start = occurrence.start;
      e.end = occurrence.end;
      e.title = series.title;
      e.venue = series.venue;
    }
    for (const o of plan.create) this.newEvent(series, o);
    await this.dropOrphans(plan.orphans.map((orphanId) => byId.get(orphanId) as Event));
    await this.em.flush();
    // One notification per player, not one per regenerated session.
    await this.notifications.notifyCalledUpSeries(a.clubId as string, series.title, moved);
    return this.toDto(series, await this.em.count(Event, { series: id }));
  }

  /** The confirmation of "remove the future sessions": the numbers the removal would give now, nothing changes. */
  async removalPreview(a: AuthContext, id: string): Promise<RemovalDto> {
    const series = await this.loadToRemove(a, id);
    return (await this.removalOf(series)).dto;
  }

  /**
   * "Remove this and all future sessions", all in one flush: the sessions whose attendance check has not opened go, with
   * their call-ups and responses (they die with the event), and the series ends the day before the first one, or goes
   * if no session stays (see `planRemoval`). The players with a sent call-up on them get one notification, after the commit.
   */
  async removeFuture(a: AuthContext, id: string): Promise<RemovalDto> {
    const series = await this.loadToRemove(a, id);
    const { rows, plan, dto } = await this.removalOf(series);
    if (plan.remove.length === 0) return dto;
    const clubId = a.clubId as string;

    // Read before the flush: the call-ups are gone with the sessions after it.
    const calledUp = await this.notifications.calledUpUsers(clubId, plan.remove);
    const dayOf = new Map(rows.map((e) => [e.id, localDate(e.start, series.timezone)]));
    const daysByUser = new Map([...calledUp].map(([userId, eventIds]) => [userId, [...eventIds].map((eventId) => dayOf.get(eventId) as string)]));

    const byId = new Map(rows.map((e) => [e.id, e]));
    for (const eventId of plan.remove) this.em.remove(byId.get(eventId) as Event);
    if (plan.series === 'removed') this.em.remove(series);
    else if (plan.series !== 'untouched') series.untilTo = plan.series.endsOn;
    await this.em.flush();
    await this.notifications.notifyRemovedSeries(clubId, series.title, daysByUser);
    return dto;
  }

  /** The series of a removal or its confirmation: the person may plan events in its team and the season is active. */
  private async loadToRemove(a: AuthContext, id: string): Promise<EventSeries> {
    await this.authz.request(a, 'events.manage', { seriesId: id });
    const series = await this.load(id);
    if (!canPlanEvents(series.season.status)) throw seasonClosed();
    return series;
  }

  /** What goes and what stays, now. The confirmation and the removal both read it here, so they cannot disagree. */
  private async removalOf(series: EventSeries): Promise<{ rows: Event[]; plan: RemovalPlan; dto: RemovalDto }> {
    const rows = await this.em.find(Event, { series: series.id });
    const ids = rows.map((e) => e.id);
    const recorded = ids.length ? await this.em.find(Attendance, { event: { $in: ids } }, { fields: ['event'] }) : [];
    const withAttendance = new Set(recorded.map((r) => r.event.id));
    const plan = planRemoval(
      rows.map((e) => ({ id: e.id, occurrenceDate: e.occurrenceDate as string, start: e.start, hasAttendance: withAttendance.has(e.id) })),
      series.startDate,
      new Date(),
    );
    // Players only: a staff member's answer is a call-up row too, but it is not a player of the confirmation.
    const callups = plan.remove.length
      ? await this.em.find(Callup, { event: { $in: plan.remove }, enrollment: { type: EnrollmentType.PLAYER } }, { fields: ['enrollment'] })
      : [];
    const players = new Set(callups.map((c) => c.enrollment.id)).size;
    return { rows, plan, dto: { sessions: plan.remove.length, players, kept: plan.keep.length } };
  }

  /** `timezone` of the stored series on an edit; a new series takes the club's. Throws the error of the first rule broken. */
  private check(fields: SeriesFields, season: Pick<Season, 'startDate' | 'endDate'>, timezone: string = CLUB_TIMEZONE): Occurrence[] {
    if (!validIsoDate(fields.startDate) || (fields.endDate !== null && !validIsoDate(fields.endDate))) throw invalidData();
    const spec: SeriesSpec = {
      rule: fields.rule,
      startDate: fields.startDate,
      untilDate: fields.endDate ?? season.endDate,
      timeStart: fields.timeStart,
      durationMinutes: fields.durationMinutes,
      timezone,
    };
    const issue = seriesIssue(spec);
    if (issue) throw new BadRequestException(ISSUES[issue]);
    const wanted = occurrences(spec);
    if (
      seriesOutsideSeason(spec.startDate, spec.untilDate, season) ||
      wanted.some((o) => !insideSeason(o.start, o.end, season, timezone))
    ) {
      throw outsideSeason();
    }
    return wanted;
  }

  /** `em.create` registers it: the flush of the caller saves it. */
  private newEvent(series: EventSeries, o: Occurrence): Event {
    return this.em.create(Event, {
      club: series.club.id,
      season: series.season,
      series,
      occurrenceDate: o.date,
      exception: false,
      type: series.type,
      title: series.title,
      start: o.start,
      end: o.end,
      venue: series.venue,
      note: null,
      status: EventStatus.SCHEDULED,
      opponent: null,
      homeAway: null,
      competition: null,
      ownScore: null,
      opponentScore: null,
    });
  }

  /** Call-ups and attendance die with their event (cascade): a session that has any is kept, and counts as edited by hand. */
  private async dropOrphans(orphans: Event[]): Promise<void> {
    if (orphans.length === 0) return;
    const ids = orphans.map((e) => e.id);
    const [callups, attendances] = await Promise.all([
      this.em.find(Callup, { event: { $in: ids } }, { fields: ['event'] }),
      this.em.find(Attendance, { event: { $in: ids } }, { fields: ['event'] }),
    ]);
    const used = new Set([...callups, ...attendances].map((r) => r.event.id));
    for (const e of orphans) {
      if (used.has(e.id)) e.exception = true;
      else this.em.remove(e);
    }
  }

  private async load(id: string): Promise<EventSeries> {
    return this.em.findOneOrFail(EventSeries, { id }, { populate: ['season.team', 'venue'] });
  }

  private toDto(s: EventSeries, eventCount: number): SeriesDto {
    const rule = parseRule(s.rule) as NonNullable<ReturnType<typeof parseRule>>;
    return {
      id: s.id,
      seasonId: s.season.id,
      teamId: s.season.team.id,
      type: s.type,
      title: s.title,
      venue: s.venue ? { id: s.venue.id, name: s.venue.name } : null,
      weekdays: rule.weekdays,
      intervalWeeks: rule.intervalWeeks,
      startDate: s.startDate,
      endDate: s.untilTo ?? s.season.endDate,
      timeStart: s.timeStart,
      durationMinutes: s.durationMinutes,
      eventCount,
    };
  }
}
