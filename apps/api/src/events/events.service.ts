import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { EventStatus, EventType, HomeAway, SeasonStatus } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { Event } from '../entities/event.entity';
import { Season } from '../entities/season.entity';
import { AuthorizationsService } from '../permissions/authorizations.service';
import { CatalogService } from './catalog.service';
import type { CreateEventDto, EditEventDto } from './dto';
import {
  canChangeStatus,
  canPlanEvents,
  clearMatchFields,
  editableEvent,
  eventIssue,
  insideSeason,
  normalizeName,
  parseInstant,
  type EventFields,
  type EventIssue,
} from './event.rules';
import { canReadSeasonEvents } from './visibility';

export interface EventDto {
  id: string;
  seasonId: string;
  teamId: string;
  type: EventType;
  title: string | null;
  start: string;
  end: string;
  venue: { id: string; name: string } | null;
  note: string | null;
  status: EventStatus;
  opponent: { id: string; name: string } | null;
  homeAway: HomeAway | null;
  competition: string | null;
}

const ISSUES: Record<EventIssue, { message: string; code: string }> = {
  period: { message: 'The event must end after it starts', code: 'INVALID_PERIOD_EVENT' },
  match_incomplete: { message: 'A match needs an opponent and home or away', code: 'MATCH_FIELDS_REQUIRED' },
  match_fields_not_allowed: { message: 'Opponent, home or away and competition apply only to a match', code: 'MATCH_FIELDS_NOT_ALLOWED' },
};

const invalidData = () => new BadRequestException({ message: 'Invalid data', code: 'INVALID_DATA' });
const outsideSeason = () => new BadRequestException({ message: 'The event falls outside the season dates', code: 'EVENT_OUTSIDE_SEASON' });
const seasonClosed = () => new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });

function toEventDto(e: Event, teamId: string): EventDto {
  return {
    id: e.id,
    seasonId: e.season.id,
    teamId,
    type: e.type,
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    venue: e.venue ? { id: e.venue.id, name: e.venue.name } : null,
    note: e.note,
    status: e.status,
    opponent: e.opponent ? { id: e.opponent.id, name: e.opponent.name } : null,
    homeAway: e.homeAway,
    competition: e.competition,
  };
}

/**
 * Check order: the target exists in the club (404), the person may (403), the season state (409), then the data (400).
 * Class-validator already refused malformed payloads before the handler.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly em: EntityManager,
    private readonly authz: AuthorizationsService,
    private readonly catalog: CatalogService,
  ) {}

  async create(a: AuthContext, teamId: string, dto: CreateEventDto): Promise<EventDto> {
    await this.authz.request(a, 'events.manage', { teamId });
    const season = await this.em.findOne(Season, { team: teamId, status: SeasonStatus.ACTIVE }, { populate: ['team.activity'] });
    if (!season) throw new ConflictException({ message: 'The team has no active season', code: 'NO_ACTIVE_SEASON' });

    const start = parseInstant(dto.start);
    const end = parseInstant(dto.end);
    if (!start || !end) throw invalidData();
    const competition = dto.competition ? normalizeName(dto.competition) : null;
    this.check({ type: dto.type, start, end, hasOpponent: !!dto.opponent, homeAway: dto.homeAway ?? null, competition }, season);

    const venue = dto.venueId ? await this.catalog.venue(dto.venueId) : null;
    const opponent = dto.opponent ? await this.catalog.opponent(a.clubId as string, season.team.activity.id, dto.opponent) : null;
    const e = this.em.create(Event, {
      club: a.clubId as string,
      season,
      series: null,
      exception: false,
      type: dto.type,
      title: dto.title ?? null,
      start,
      end,
      venue,
      note: dto.note ?? null,
      status: EventStatus.SCHEDULED,
      opponent,
      homeAway: dto.homeAway ?? null,
      competition,
      ownScore: null,
      opponentScore: null,
    });
    await this.em.flush();
    return toEventDto(e, season.team.id);
  }

  async edit(a: AuthContext, id: string, dto: EditEventDto): Promise<EventDto> {
    await this.authz.request(a, 'events.manage', { eventId: id });
    const e = await this.load(id);
    this.assertSeasonOpen(e);
    if (!editableEvent(e.status)) throw new ConflictException({ message: 'The event can no longer be edited', code: 'EVENT_NOT_EDITABLE' });

    const start = dto.start === undefined ? e.start : parseInstant(dto.start);
    const end = dto.end === undefined ? e.end : parseInstant(dto.end);
    if (!start || !end) throw invalidData();
    const datesChanged = start.getTime() !== e.start.getTime() || end.getTime() !== e.end.getTime();

    // Leaving the match type drops the stored match fields; the request can then not set them again.
    const kept = clearMatchFields({
      type: dto.type ?? e.type,
      start,
      end,
      hasOpponent: e.opponent !== null,
      homeAway: e.homeAway,
      competition: e.competition,
    });
    const competition = dto.competition === undefined ? kept.competition : dto.competition === null ? null : normalizeName(dto.competition);
    const fields: EventFields = {
      ...kept,
      hasOpponent: dto.opponent === undefined ? kept.hasOpponent : dto.opponent !== null,
      homeAway: dto.homeAway === undefined ? kept.homeAway : dto.homeAway,
      competition,
    };
    this.check(fields, datesChanged ? e.season : null);

    if (dto.venueId !== undefined) e.venue = dto.venueId === null ? null : await this.catalog.venue(dto.venueId);
    if (fields.type !== EventType.MATCH) e.opponent = null;
    else if (dto.opponent !== undefined) {
      e.opponent = dto.opponent === null ? null : await this.catalog.opponent(a.clubId as string, e.season.team.activity.id, dto.opponent);
    }
    e.type = fields.type;
    e.start = start;
    e.end = end;
    e.homeAway = fields.homeAway;
    e.competition = fields.competition;
    if (dto.title !== undefined) e.title = dto.title;
    if (dto.note !== undefined) e.note = dto.note;
    // Giving a postponed event new dates schedules it again.
    if (e.status === EventStatus.POSTPONED && datesChanged) e.status = EventStatus.SCHEDULED;
    await this.em.flush();
    return toEventDto(e, e.season.team.id);
  }

  /** Cancelled and postponed are kept apart: neither counts as served for suspensions (rule 13). */
  async changeStatus(a: AuthContext, id: string, to: EventStatus.CANCELLED | EventStatus.POSTPONED): Promise<EventDto> {
    await this.authz.request(a, 'events.manage', { eventId: id });
    const e = await this.load(id);
    this.assertSeasonOpen(e);
    if (!canChangeStatus(e.status, to)) throw new ConflictException({ message: 'The event cannot change to this status', code: 'EVENT_STATUS_INVALID' });
    e.status = to;
    await this.em.flush();
    return toEventDto(e, e.season.team.id);
  }

  /** Who reads: admin and managers in their scope, anyone enrolled in the season (rule 7: the history stays readable). */
  async list(a: AuthContext, seasonId: string): Promise<EventDto[]> {
    const target = await this.authz.target(a.clubId as string, { seasonId });
    const enrolled = a.personId
      ? (await this.em.find(Enrollment, { person: a.personId, season: seasonId }, { filters: false, fields: ['season'] })).map((i) => i.season.id)
      : [];
    const season = { id: seasonId, activityId: target.activityId as string, teamId: target.teamId as string };
    if (!canReadSeasonEvents(a.roles, enrolled, season)) {
      throw new ForbiddenException({ message: 'You do not have permission for this operation', code: 'PERMISSION_DENIED' });
    }
    const rows = await this.em.find(Event, { season: seasonId }, { populate: ['venue', 'opponent'], orderBy: { start: 'asc' } });
    return rows.map((e) => toEventDto(e, season.teamId));
  }

  /** The team of the season and whether the person can plan events in it now (policy in scope and active season). For the UI only, the writes check again. */
  async access(a: AuthContext, seasonId: string): Promise<{ teamId: string; canManage: boolean }> {
    const target = await this.authz.target(a.clubId as string, { seasonId }); // 404 SEASON_NOT_FOUND
    const season = await this.em.findOneOrFail(Season, { id: seasonId, club: a.clubId as string }, { filters: false, fields: ['status'] });
    const canManage = canPlanEvents(season.status) && (await this.authz.can(a, 'events.manage', { seasonId }));
    return { teamId: target.teamId as string, canManage };
  }

  /** Competition names already used in the season, to suggest them in the form. */
  async competitions(a: AuthContext, seasonId: string): Promise<string[]> {
    await this.authz.request(a, 'events.manage', { seasonId });
    const rows = await this.em.find(Event, { season: seasonId, competition: { $ne: null } }, { fields: ['competition'] });
    return [...new Set(rows.map((e) => e.competition as string))].sort((x, y) => x.localeCompare(y));
  }

  /** `season` null skips the dates check (an edit that does not move the event). */
  private check(fields: EventFields, season: Pick<Season, 'startDate' | 'endDate'> | null) {
    const issue = eventIssue(fields);
    if (issue) throw new BadRequestException(ISSUES[issue]);
    if (season && !insideSeason(fields.start, fields.end, season)) throw outsideSeason();
  }

  private async load(id: string): Promise<Event> {
    return this.em.findOneOrFail(Event, { id }, { populate: ['season.team.activity', 'venue', 'opponent'] });
  }

  private assertSeasonOpen(e: Event) {
    if (!canPlanEvents(e.season.status)) throw seasonClosed();
  }
}
