export interface DraftUsage {
  /** The record was created by the invitation itself, not picked from the club's people. */
  createdByInvitation: boolean;
  hasUser: boolean;
  completed: boolean;
  enrollments: number;
  certificates: number;
  /** Other still open invitations that point at the same record. */
  otherOpenInvitations: number;
}

/** A draft record has value for the club only once somebody uses it: until then a revoked invitation takes it along. */
export function isDiscardableDraft(u: DraftUsage): boolean {
  return u.createdByInvitation && !u.hasUser && !u.completed && u.enrollments === 0 && u.certificates === 0 && u.otherOpenInvitations === 0;
}
