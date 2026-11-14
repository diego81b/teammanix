import { describe, expect, it } from 'vitest'
import { BOOLEAN_SETTINGS } from '../../app/utils/club-settings'

describe('settings descriptors', () => {
  it('every boolean setting has a unique key', () => {
    const keys = BOOLEAN_SETTINGS.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(['certificatesWithFile', 'blockCertificateExpired', 'warnNoCoachAvailable'])
  })
})
