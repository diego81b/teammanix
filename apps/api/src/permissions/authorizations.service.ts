import { EntityManager } from '@mikro-orm/postgresql';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Membership } from '../entities/membership.entity';
import { Activity } from '../entities/activity.entity';
import { SeasonStatus, EnrollmentType } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { Event } from '../entities/event.entity';
import { EventSeries } from '../entities/event-series.entity';
import { Team } from '../entities/team.entity';
import { Season } from '../entities/season.entity';
import { targetFromActivity, targetFromClub, targetFromTeam, sourcesFrom } from './sources';
import { can, sees as seesTarget, type Target, type PolicyKey } from './policy';

/** Where the action falls, as the route states it: the club, an activity, a team, a season or an enrollment. */
export type Goal =
  | { club: true }
  | { activityId: string }
  | { teamId: string }
  | { seasonId: string }
  | { enrollmentId: string }
  | { eventId: string }
  | { seriesId: string };

/**
 * Applies the policies (rule 14) with the role's scope. The handler says which policy is needed and what the
 * action falls on; the service resolves the target in the active club and computes the sources from the DB.
 *
 * Queries are explicit about the club (`filters: false` plus `club`), so the result does not depend on the
 * request's tenant filter. A target of another club does not exist: 404, never 403.
 */
@Injectable()
export class AuthorizationsService {
  constructor(private readonly em: EntityManager) {}

  /** Throws 404 if the target is not in the club, 403 `PERMISSION_DENIED` if the person does not have the policy there. */
  async request(a: AuthContext, policy: PolicyKey, on: Goal): Promise<void> {
    if (!(await this.can(a, policy, on))) {
      throw new ForbiddenException({ message: 'You do not have permission for this operation', code: 'PERMISSION_DENIED' });
    }
  }

  async can(a: AuthContext, policy: PolicyKey, on: Goal): Promise<boolean> {
    const clubId = a.clubId as string;
    const target = await this.target(clubId, on);
    const admin = sourcesFrom(a.roles, []);
    // The admin needs nothing else: their policies cannot be removed.
    if (admin.some((f) => f.role === 'admin')) return can(admin, {}, policy, target);

    const [staff, row] = await Promise.all([this.enrollmentsStaff(a), this.em.findOne(Membership, { user: a.userId, club: clubId }, { filters: false })]);
    return can(sourcesFrom(a.roles, staff), row?.diff ?? {}, policy, target);
  }

  /**
   * Whether the target is inside the scope of some role of the person. Who does not see it must get 404, never 403:
   * players of other teams are not even visible to staff.
   */
  async sees(a: AuthContext, on: Goal): Promise<boolean> {
    const target = await this.target(a.clubId as string, on);
    const staff = await this.enrollmentsStaff(a);
    return seesTarget(sourcesFrom(a.roles, staff), target);
  }

  /** Activity and team the target belongs to, only inside the club. */
  async target(clubId: string, on: Goal): Promise<Target> {
    const options = { filters: false } as const;
    if ('club' in on) return targetFromClub();
    if ('activityId' in on) {
      const act = await this.em.findOne(Activity, { id: on.activityId, club: clubId }, options);
      if (!act) throw new NotFoundException({ message: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });
      return targetFromActivity(act.id);
    }
    if ('teamId' in on) {
      const sq = await this.em.findOne(Team, { id: on.teamId, club: clubId }, { ...options, populate: ['activity'] });
      if (!sq) throw new NotFoundException({ message: 'Team not found', code: 'TEAM_NOT_FOUND' });
      return targetFromTeam(sq.activity.id, sq.id);
    }
    if ('seasonId' in on) {
      const st = await this.em.findOne(Season, { id: on.seasonId, club: clubId }, { ...options, populate: ['team.activity'] });
      if (!st) throw new NotFoundException({ message: 'Season not found', code: 'SEASON_NOT_FOUND' });
      return targetFromTeam(st.team.activity.id, st.team.id);
    }
    if ('eventId' in on) {
      const ev = await this.em.findOne(Event, { id: on.eventId, club: clubId }, { ...options, populate: ['season.team.activity'] });
      if (!ev) throw new NotFoundException({ message: 'Event not found', code: 'EVENT_NOT_FOUND' });
      return targetFromTeam(ev.season.team.activity.id, ev.season.team.id);
    }
    if ('seriesId' in on) {
      const sr = await this.em.findOne(EventSeries, { id: on.seriesId, club: clubId }, { ...options, populate: ['season.team.activity'] });
      if (!sr) throw new NotFoundException({ message: 'Series not found', code: 'SERIES_NOT_FOUND' });
      return targetFromTeam(sr.season.team.activity.id, sr.season.team.id);
    }
    const i = await this.em.findOne(Enrollment, { id: on.enrollmentId, club: clubId }, { ...options, populate: ['season.team.activity'] });
    if (!i) throw new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
    return targetFromTeam(i.season.team.activity.id, i.season.team.id);
  }

  /** Open staff enrollments in non-closed seasons of the person linked to the account. The player has none. */
  private async enrollmentsStaff(a: AuthContext) {
    if (!a.personId) return [];
    const rows = await this.em.find(
      Enrollment,
      {
        club: a.clubId as string,
        person: a.personId,
        type: EnrollmentType.STAFF,
        endedAt: null,
        season: { status: { $ne: SeasonStatus.CLOSED } },
      },
      { filters: false, populate: ['season.team.activity'] },
    );
    return rows.map((i) => ({ staffRole: i.staffRole, activityId: i.season.team.activity.id, teamId: i.season.team.id }));
  }
}
