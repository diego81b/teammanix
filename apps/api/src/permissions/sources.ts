import type { CtxRole } from '../common/auth-context';
import { AccessRoleType, ScopeType, type StaffPolicyModel } from '../entities/enums';
import type { PolicyScope, Target, Source } from './policy';

/** Open staff enrollment, in a non-closed season, with the team already resolved. */
export interface EnrollmentStaffCtx {
  /** Permission model of the staff role of the enrollment. */
  policyModel: StaffPolicyModel | null;
  teamId: string;
}

/** The scope of a role, or null when the scope names a target the row lacks: such a role covers nothing. */
function scopeFrom(r: CtxRole): PolicyScope | null {
  switch (r.scope) {
    case ScopeType.CLUB:
      return { type: 'club' };
    case ScopeType.SECTION:
      return r.sectionId ? { type: 'section', sectionId: r.sectionId } : null;
    case ScopeType.TEAM:
      return r.teamId ? { type: 'team', teamId: r.teamId } : null;
  }
}

/**
 * The sources from which a person derives permissions: access roles (admin, manager) with their scope and
 * staff enrollments, always limited to the team. The player has no sources: no management policy.
 */
export function sourcesFrom(roles: readonly CtxRole[], staff: readonly EnrollmentStaffCtx[]): Source[] {
  const fromRoles = roles.flatMap((r): Source[] => {
    const scope = scopeFrom(r);
    return scope ? [{ role: r.role === AccessRoleType.ADMIN ? 'admin' : 'manager', scope }] : [];
  });
  const fromStaff = staff.map((s): Source => ({ role: s.policyModel ?? 'none', scope: { type: 'team', teamId: s.teamId } }));
  return [...fromRoles, ...fromStaff];
}

export const targetFromClub = (): Target => ({ sectionId: null, teamId: null });
export const targetFromSection = (sectionId: string): Target => ({ sectionId, teamId: null });
export const targetFromTeam = (sectionId: string | null, teamId: string): Target => ({ sectionId, teamId });
