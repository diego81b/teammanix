import type { CtxRole } from '../common/auth-context';
import { ScopeType } from '../entities/enums';
import { localDate } from './event.rules';

/** Pure rules for the calendar views. No DB, no Nest. */

/**
 * Whether an enrollment still shows an event. An open enrollment shows every event of the season. A closed one
 * (promotion, transfer) shows the events up to its end day, in the club's local time, and none after it: the person
 * keeps their history and does not see what the team does once they have left.
 */
export function enrollmentCovers(endedAt: string | null, eventStart: Date): boolean {
  return endedAt === null || localDate(eventStart) <= endedAt;
}

/** The seasons a person reads through a role, without being enrolled. */
export type SeasonScope = { all: true } | { all: false; activityIds: string[]; teamIds: string[] };

export function seasonScope(roles: readonly CtxRole[]): SeasonScope {
  if (roles.some((r) => r.scope === ScopeType.CLUB)) return { all: true };
  const activityIds = new Set<string>();
  const teamIds = new Set<string>();
  for (const r of roles) {
    if (r.scope === ScopeType.ACTIVITY && r.activityId) activityIds.add(r.activityId);
    if (r.scope === ScopeType.TEAM && r.teamId) teamIds.add(r.teamId);
  }
  return { all: false, activityIds: [...activityIds], teamIds: [...teamIds] };
}

export function seasonVisible(scope: SeasonScope, season: { activityId: string; teamId: string }): boolean {
  return scope.all || scope.activityIds.includes(season.activityId) || scope.teamIds.includes(season.teamId);
}
