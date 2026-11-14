import { EnrollmentType, SeasonStatus, type StaffPolicyModel } from '../entities/enums';
import type { RolePolicy } from '../permissions/policy';

export interface EnrollmentData {
  type: EnrollmentType;
  staffRoleId?: string | null;
  position?: string | null;
  jerseyNumber?: number | null;
}

export type EnrollmentError =
  | 'STAFF_ROLE_REQUIRED'
  | 'STAFF_ROLE_NOT_ALLOWED'
  | 'PLAYER_DATA_NOT_ALLOWED'
  | 'INVALID_NUMBER_JERSEY'
  | 'INVALID_POSITION';

/** Consistency of an enrollment's data: staff has a role, player has position and jersey. Null if valid. */
export function validateEnrollment(d: EnrollmentData): EnrollmentError | null {
  const staff = d.type === EnrollmentType.STAFF;
  if (staff && !d.staffRoleId) return 'STAFF_ROLE_REQUIRED';
  if (!staff && d.staffRoleId) return 'STAFF_ROLE_NOT_ALLOWED';
  const hasDataPlayer = (d.position !== undefined && d.position !== null) || (d.jerseyNumber !== undefined && d.jerseyNumber !== null);
  if (staff && hasDataPlayer) return 'PLAYER_DATA_NOT_ALLOWED';
  const n = d.jerseyNumber;
  if (n !== undefined && n !== null && (!Number.isInteger(n) || n < 0 || n > 999)) return 'INVALID_NUMBER_JERSEY';
  return null;
}

/** Position is optional. If present, it must be a code of the team's sport profile; a profile without positions rejects all of them. */
export function allowedPosition(position: string | null | undefined, allowed: readonly string[]): boolean {
  return position === null || position === undefined || allowed.includes(position);
}

/** Promotion to another team: the origin position stays only if the destination profile has it. */
export function positionInherited(position: string | null, allowed: readonly string[]): string | null {
  return position !== null && allowed.includes(position) ? position : null;
}

/** Role with which an enrollment enters the permission computation: the permission model of the staff role. */
export function rolePolicyFrom(i: { type: EnrollmentType; staffRole: { policyModel: StaffPolicyModel } | null }): RolePolicy {
  if (i.type === EnrollmentType.PLAYER) return 'player';
  return i.staffRole?.policyModel ?? 'none';
}

/** The season of a team to enroll into: the active one, else the draft. A team with only closed seasons, or none, has none. */
export function seasonToEnroll(seasons: readonly { id: string; status: SeasonStatus }[]): string | null {
  return (seasons.find((s) => s.status === SeasonStatus.ACTIVE) ?? seasons.find((s) => s.status === SeasonStatus.DRAFT))?.id ?? null;
}
