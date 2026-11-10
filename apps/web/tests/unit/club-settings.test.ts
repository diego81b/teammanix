import { describe, expect, it } from 'vitest'
import { BOOLEAN_SETTINGS, COACH_ROLE_CHOICES, toggleCoachRole } from '../../app/utils/club-settings'

describe('toggleCoachRole', () => {
  it('adds a role that is not selected', () => {
    expect(toggleCoachRole(['coach'], 'assistant_coach')).toEqual(['coach', 'assistant_coach'])
  })
  it('removes a role that is selected while another remains', () => {
    expect(toggleCoachRole(['coach', 'assistant_coach'], 'coach')).toEqual(['assistant_coach'])
  })
  it('refuses to clear the last role: returns null', () => {
    expect(toggleCoachRole(['coach'], 'coach')).toBeNull()
  })
  it('does not mutate the input', () => {
    const roles = ['coach'] as const
    toggleCoachRole([...roles], 'trainer')
    expect(roles).toEqual(['coach'])
  })
})

describe('settings descriptors', () => {
  it('every boolean setting has a unique key', () => {
    const keys = BOOLEAN_SETTINGS.map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(['certificatesWithFile', 'blockCertificateExpired', 'warnNoCoachAvailable'])
  })
  it('lists every staff role as a coach role choice', () => {
    expect(COACH_ROLE_CHOICES).toEqual(['coach', 'assistant_coach', 'trainer', 'escort', 'other'])
  })
})
