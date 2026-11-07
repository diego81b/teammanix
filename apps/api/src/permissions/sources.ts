import type { CtxRole } from '../common/auth-context';
import { AccessRoleType, ScopeType, type StaffRole } from '../entities/enums';
import type { PolicyScope, Target, Source } from './policy';

/** Open staff enrollment, in a non-closed season, with activity and team already resolved. */
export interface EnrollmentStaffCtx {
  staffRole: StaffRole | null;
  activityId: string;
  teamId: string;
}

function scopeFrom(r: CtxRole): PolicyScope {
  switch (r.scope) {
    case ScopeType.CLUB:
      return { type: 'club' };
    case ScopeType.ACTIVITY:
      return { type: 'activity', activityId: r.activityId as string };
    case ScopeType.TEAM:
      // An access role with team scope does not store the activity (the invitation forbids it): for the policy only the team counts.
      return { type: 'team', activityId: r.activityId ?? '', teamId: r.teamId as string };
  }
}

/**
 * The sources from which a person derives permissions: access roles (admin, manager) with their scope and
 * staff enrollments, always limited to the team. The player has no sources: no management policy.
 */
export function sourcesFrom(roles: readonly CtxRole[], staff: readonly EnrollmentStaffCtx[]): Source[] {
  return [
    ...roles.map((r): Source => ({ role: r.role === AccessRoleType.ADMIN ? 'admin' : 'manager', scope: scopeFrom(r) })),
    ...staff.map(
      (s): Source => ({
        role: s.staffRole ?? 'other',
        scope: { type: 'team', activityId: s.activityId, teamId: s.teamId },
      }),
    ),
  ];
}

export const targetFromClub = (): Target => ({ activityId: null, teamId: null });
export const targetFromActivity = (activityId: string): Target => ({ activityId, teamId: null });
export const targetFromTeam = (activityId: string, teamId: string): Target => ({ activityId, teamId });
