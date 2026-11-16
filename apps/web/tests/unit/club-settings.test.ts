import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en'
import fr from '../../i18n/locales/fr'
import it_ from '../../i18n/locales/it'
import { BOOLEAN_SETTINGS, settingGroups } from '../../app/utils/club-settings'

describe('settings descriptors', () => {
  it('every boolean setting has a unique key', () => {
    const keys = BOOLEAN_SETTINGS.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(['certificatesWithFile', 'blockCertificateExpired', 'warnNoCoachAvailable'])
  })
})

describe('settingGroups', () => {
  it('puts the switches under the certificates and call-ups headings, in display order', () => {
    expect(settingGroups().map(g => ({ id: g.id, keys: g.settings.map(s => s.key) }))).toEqual([
      { id: 'certificates', keys: ['certificatesWithFile'] },
      { id: 'callups', keys: ['blockCertificateExpired', 'warnNoCoachAvailable'] },
    ])
  })

  it('lists every setting once, none lost', () => {
    const grouped = settingGroups().flatMap(g => g.settings.map(s => s.key))
    expect(grouped.sort()).toEqual(BOOLEAN_SETTINGS.map(s => s.key).sort())
  })

  it('has a heading text in every language', () => {
    for (const [name, locale] of Object.entries({ it: it_, en, fr })) {
      const groups = locale.settings.groups as Record<string, unknown>
      for (const g of settingGroups()) expect(groups[g.id], `${name}: settings.groups.${g.id}`).toBeTypeOf('string')
    }
  })
})
