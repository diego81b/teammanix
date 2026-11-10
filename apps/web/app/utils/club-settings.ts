import type { ClubSettings, StaffRole } from '../types/api'

type BooleanKey = {
  [K in keyof ClubSettings]: ClubSettings[K] extends boolean ? K : never
}[keyof ClubSettings]

/**
 * Boolean club settings, in display order. The page renders one switch per entry with the texts
 * `settings.<key>.label` and `settings.<key>.text`: a setting added by another slice needs only an entry here and the texts.
 */
export const BOOLEAN_SETTINGS: readonly { key: BooleanKey }[] = [
  { key: 'certificatesWithFile' },
  { key: 'blockCertificateExpired' },
  { key: 'warnNoCoachAvailable' },
]

export const COACH_ROLE_CHOICES: readonly StaffRole[] = ['coach', 'assistant_coach', 'trainer', 'escort', 'other']

/** Adds or removes a role; null when it would leave the list empty (the API refuses an empty list too). */
export function toggleCoachRole(current: readonly StaffRole[], role: StaffRole): StaffRole[] | null {
  if (!current.includes(role)) return [...current, role]
  const next = current.filter(r => r !== role)
  return next.length === 0 ? null : next
}
