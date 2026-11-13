export type ArchiveActionOutcome = 'ok' | 'PERSON_NOT_DISABLED' | 'PERSON_NOT_FOUND';

export function archiveAction(p: { disabledAt: Date | null; anonymizedAt: Date | null }): ArchiveActionOutcome {
  if (p.anonymizedAt) return 'PERSON_NOT_FOUND';
  if (!p.disabledAt) return 'PERSON_NOT_DISABLED';
  return 'ok';
}

/** Empty name, not a placeholder: each screen shows its own translated label. */
export const ANONYMIZED = {
  name: '',
  surname: null,
  birthDate: null,
  email: null,
  phone: null,
  photoUrl: null,
  completedAt: null,
} as const;

/** Named by id: no names in logs or browser history. */
export const exportFileName = (personId: string): string => `person-${personId}.json`;
