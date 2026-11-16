import type { ClubSettings } from '../types/api'

type BooleanKey = {
  [K in keyof ClubSettings]: ClubSettings[K] extends boolean ? K : never
}[keyof ClubSettings]

export type SettingGroupId = 'certificates' | 'callups'

export interface BooleanSetting {
  key: BooleanKey
  /** Heading the switch sits under (`settings.groups.<group>`). */
  group: SettingGroupId
}

/**
 * Boolean club settings, in display order. The page renders one switch per entry with the texts
 * `settings.<key>.label` and `settings.<key>.text`: a setting added by another slice needs only an entry here and the texts.
 */
export const BOOLEAN_SETTINGS: readonly BooleanSetting[] = [
  { key: 'certificatesWithFile', group: 'certificates' },
  { key: 'blockCertificateExpired', group: 'callups' },
  { key: 'warnNoCoachAvailable', group: 'callups' },
]

/** The switches under their headings, headings and switches in display order. */
export function settingGroups(): { id: SettingGroupId, settings: BooleanSetting[] }[] {
  const ids = [...new Set(BOOLEAN_SETTINGS.map(s => s.group))]
  return ids.map(id => ({ id, settings: BOOLEAN_SETTINGS.filter(s => s.group === id) }))
}
