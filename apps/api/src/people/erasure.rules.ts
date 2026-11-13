/**
 * Export (art. 15 and 20) and permanent deletion (art. 17) of a person from the archive. Both only on a disabled person;
 * a deleted one is anonymized and, for the club, no longer exists.
 */
export type ArchiveActionOutcome = 'ok' | 'PERSON_NOT_DISABLED' | 'PERSON_NOT_FOUND';

export function archiveAction(p: { disabledAt: Date | null; anonymizedAt: Date | null }): ArchiveActionOutcome {
  if (p.anonymizedAt) return 'PERSON_NOT_FOUND';
  if (!p.disabledAt) return 'PERSON_NOT_DISABLED';
  return 'ok';
}

/**
 * The record after deletion. The row stays so enrollments, call-ups and attendance keep the team figures; the name is
 * empty, not a placeholder text, so every screen shows its own translated label for a person without a name.
 */
export const ANONYMIZED = {
  name: '',
  surname: null,
  birthDate: null,
  email: null,
  phone: null,
  photoUrl: null,
  completedAt: null,
} as const;

/** The download name: the id keeps names out of logs and browser history. */
export const exportFileName = (personId: string): string => `person-${personId}.json`;
