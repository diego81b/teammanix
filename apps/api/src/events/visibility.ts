import type { CtxRole } from '../common/auth-context';
import { EnrollmentType, ScopeType } from '../entities/enums';

export interface SeasonTarget {
  id: string;
  activityId: string;
  teamId: string;
}

/**
 * Who reads the events of a season (ANALISI section 6): admin and managers within the scope of their role,
 * any person enrolled in that season (the player keeps the history of all their seasons). Not a policy:
 * policies are for management actions.
 */
export function canReadSeasonEvents(roles: readonly CtxRole[], enrolledSeasonIds: readonly string[], season: SeasonTarget): boolean {
  if (enrolledSeasonIds.includes(season.id)) return true;
  return roles.some((r) => {
    switch (r.scope) {
      case ScopeType.CLUB:
        return true;
      case ScopeType.ACTIVITY:
        return r.activityId === season.activityId;
      case ScopeType.TEAM:
        return r.teamId === season.teamId;
    }
  });
}

/**
 * Who reads what concerns the whole roster of a season, such as declared absences: the staff of that season, managers
 * within their scope and the admin. A player of the team, alone, does not. `ownTypes` are the types of the enrollments
 * the person holds in the season.
 */
export function canReadRoster(roles: readonly CtxRole[], ownTypes: readonly EnrollmentType[], season: SeasonTarget): boolean {
  return ownTypes.includes(EnrollmentType.STAFF) || canReadSeasonEvents(roles, [], season);
}
