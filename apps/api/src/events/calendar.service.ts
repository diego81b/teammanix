import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Enrollment } from '../entities/enrollment.entity';
import { EventStatus, SeasonStatus } from '../entities/enums';
import { Event } from '../entities/event.entity';
import { Season } from '../entities/season.entity';
import { enrollmentCovers, seasonScope, seasonVisible, type SeasonScope } from './calendar.rules';
import { toEventDto, type EventDto } from './events.service';

export interface CalendarEntryDto extends EventDto {
  teamName: string;
  seasonName: string;
  seasonStatus: SeasonStatus;
}

export interface CalendarSeasonDto {
  seasonId: string;
  seasonName: string;
  seasonStatus: SeasonStatus;
  teamId: string;
  teamName: string;
  activityName: string;
}

const PAGE = 50;

function toEntry(e: Event): CalendarEntryDto {
  return { ...toEventDto(e, e.season.team.id), teamName: e.season.team.name, seasonName: e.season.name, seasonStatus: e.season.status };
}

/** Which seasons the scope reaches, as a query condition on a season. Null means none. */
function scopeCondition(scope: SeasonScope): FilterQuery<Season> | null {
  if (scope.all) return {};
  const or: FilterQuery<Season>[] = [];
  if (scope.activityIds.length) or.push({ team: { activity: { $in: scope.activityIds } } });
  if (scope.teamIds.length) or.push({ team: { $in: scope.teamIds } });
  return or.length ? { $or: or } : null;
}

/**
 * Calendar views (slice 3). Reads follow ANALISI section 6: a person reads through their enrollments (all their
 * seasons, closed ones included) and, for admin and managers, through the scope of their role. Everything is
 * limited to the active club, so calendars never mix clubs.
 */
@Injectable()
export class CalendarService {
  constructor(private readonly em: EntityManager) {}

  /** Seasons the person is enrolled in, with the end day of each of their enrollments there (null while open). */
  private async enrolled(a: AuthContext): Promise<Map<string, (string | null)[]>> {
    const bySeason = new Map<string, (string | null)[]>();
    if (!a.personId) return bySeason;
    const rows = await this.em.find(Enrollment, { person: a.personId, club: a.clubId as string }, { filters: false, fields: ['season', 'endedAt'] });
    for (const r of rows) bySeason.set(r.season.id, [...(bySeason.get(r.season.id) ?? []), r.endedAt]);
    return bySeason;
  }

  /** Personal calendar: the events of every team the person is enrolled in, in every season. Read only. */
  async mine(a: AuthContext): Promise<CalendarEntryDto[]> {
    const enrolled = await this.enrolled(a);
    if (enrolled.size === 0) return [];
    const rows = await this.em.find(
      Event,
      { season: { $in: [...enrolled.keys()] } },
      { populate: ['venue', 'opponent', 'season.team'], orderBy: { start: 'asc' } },
    );
    return rows.filter((e) => this.covered(enrolled, e)).map(toEntry);
  }

  /** The calendars the person can open: seasons they are enrolled in (active or closed) and, for the roles, the active ones in scope. */
  async seasons(a: AuthContext): Promise<CalendarSeasonDto[]> {
    const enrolled = await this.enrolled(a);
    const or: FilterQuery<Season>[] = [];
    if (enrolled.size) or.push({ id: { $in: [...enrolled.keys()] }, status: { $in: [SeasonStatus.ACTIVE, SeasonStatus.CLOSED] } });
    const scope = scopeCondition(seasonScope(a.roles));
    if (scope) or.push({ $and: [scope, { status: SeasonStatus.ACTIVE }] });
    if (or.length === 0) return [];
    const rows = await this.em.find(Season, { $or: or }, { populate: ['team.activity'] });
    return rows
      .map((s) => ({
        seasonId: s.id,
        seasonName: s.name,
        seasonStatus: s.status,
        teamId: s.team.id,
        teamName: s.team.name,
        activityName: s.team.activity.name,
      }))
      .sort(
        (x, y) =>
          Number(y.seasonStatus === SeasonStatus.ACTIVE) - Number(x.seasonStatus === SeasonStatus.ACTIVE) ||
          x.activityName.localeCompare(y.activityName) ||
          x.teamName.localeCompare(y.teamName),
      );
  }

  /**
   * The next event for the home: the soonest scheduled event that has not ended, in an active season of a team the
   * person is enrolled in or reads through a role. Cancelled and postponed events never count.
   */
  async next(a: AuthContext): Promise<CalendarEntryDto | null> {
    const enrolled = await this.enrolled(a);
    const scope = seasonScope(a.roles);
    const sources: FilterQuery<Event>[] = [];
    if (enrolled.size) sources.push({ season: { $in: [...enrolled.keys()] } });
    const reach = scopeCondition(scope);
    if (reach) sources.push({ season: reach });
    if (sources.length === 0) return null;

    const where: FilterQuery<Event> = {
      $and: [{ status: EventStatus.SCHEDULED }, { end: { $gt: new Date() } }, { season: { status: SeasonStatus.ACTIVE } }, { $or: sources }],
    };
    // An event seen only through a closed enrollment can be filtered out afterwards: read in pages until one stays.
    for (let offset = 0; ; offset += PAGE) {
      const rows = await this.em.find(Event, where, { populate: ['venue', 'opponent', 'season.team.activity'], orderBy: { start: 'asc' }, limit: PAGE, offset });
      const hit = rows.find((e) => seasonVisible(scope, { activityId: e.season.team.activity.id, teamId: e.season.team.id }) || this.covered(enrolled, e));
      if (hit) return toEntry(hit);
      if (rows.length < PAGE) return null;
    }
  }

  private covered(enrolled: Map<string, (string | null)[]>, e: Event): boolean {
    return (enrolled.get(e.season.id) ?? []).some((endedAt) => enrollmentCovers(endedAt, e.start));
  }
}
