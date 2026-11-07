import { StaffRole, EnrollmentType } from '../entities/enums';
import type { RolePolicy } from '../permissions/policy';

export interface EnrollmentData {
  type: EnrollmentType;
  staffRole?: StaffRole | null;
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
  if (staff && !d.staffRole) return 'STAFF_ROLE_REQUIRED';
  if (!staff && d.staffRole) return 'STAFF_ROLE_NOT_ALLOWED';
  const hasDataPlayer = (d.position !== undefined && d.position !== null) || (d.jerseyNumber !== undefined && d.jerseyNumber !== null);
  if (staff && hasDataPlayer) return 'PLAYER_DATA_NOT_ALLOWED';
  const n = d.jerseyNumber;
  if (n !== undefined && n !== null && (!Number.isInteger(n) || n < 0 || n > 999)) return 'INVALID_NUMBER_JERSEY';
  return null;
}

/** Position is optional. If present, it must be a code of the activity's sport profile; a profile without positions rejects all of them. */
export function allowedPosition(position: string | null | undefined, allowed: readonly string[]): boolean {
  return position === null || position === undefined || allowed.includes(position);
}

/** Promotion to another team: the origin position stays only if the destination profile has it. */
export function positionInherited(position: string | null, allowed: readonly string[]): string | null {
  return position !== null && allowed.includes(position) ? position : null;
}

/** Role with which an enrollment enters the permission computation. */
export function rolePolicyFrom(i: { type: EnrollmentType; staffRole: StaffRole | null }): RolePolicy {
  if (i.type === EnrollmentType.PLAYER) return 'player';
  return i.staffRole ?? 'other';
}
