import type { ClubSettings } from '../types/api'

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
