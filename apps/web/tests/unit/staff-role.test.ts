import { describe, expect, it } from 'vitest'
import { NAME_MAX, POLICY_MODELS, roleChoices, roleCreateBody, roleEditBody, startingRole, validRoleName } from '../../app/utils/staff-role'
import type { StaffRoleItem } from '../../app/types/api'

const role = (o: Partial<StaffRoleItem> & { id: string }): StaffRoleItem => ({
  name: o.id, policyModel: 'none', mustBeAvailable: false, archived: false, ...o,
})

const roles = [
  role({ id: 'a', name: 'Allenatore', policyModel: 'coach', mustBeAvailable: true }),
  role({ id: 'b', name: 'Vice allenatore', policyModel: 'assistant_coach' }),
  role({ id: 'c', name: 'Massaggiatore', archived: true }),
]

describe('POLICY_MODELS', () => {
  it('lists the models of rule 14, none last', () => {
    expect(POLICY_MODELS).toEqual(['coach', 'assistant_coach', 'trainer', 'none'])
  })
})

describe('validRoleName', () => {
  it('accepts 1 to 60 characters once trimmed', () => {
    expect(validRoleName('Allenatore')).toBe(true)
    expect(validRoleName('  x  ')).toBe(true)
    expect(validRoleName('a'.repeat(NAME_MAX))).toBe(true)
  })
  it('refuses empty, blank and too long', () => {
    expect(validRoleName('')).toBe(false)
    expect(validRoleName('   ')).toBe(false)
    expect(validRoleName('a'.repeat(NAME_MAX + 1))).toBe(false)
  })
})

describe('roleChoices', () => {
  it('offers the active roles only, in the order of the catalog', () => {
    expect(roleChoices(roles, null, 'archiviato')).toEqual([
      { label: 'Allenatore', value: 'a' },
      { label: 'Vice allenatore', value: 'b' },
    ])
  })
  it('keeps the archived role the enrollment already has, marked, so the form can leave it alone', () => {
    expect(roleChoices(roles, 'c', 'archiviato')).toEqual([
      { label: 'Allenatore', value: 'a' },
      { label: 'Vice allenatore', value: 'b' },
      { label: 'Massaggiatore (archiviato)', value: 'c' },
    ])
  })
  it('an active current role is not repeated', () => {
    expect(roleChoices(roles, 'a', 'archiviato').map(c => c.value)).toEqual(['a', 'b'])
  })
  it('an unknown current id changes nothing', () => {
    expect(roleChoices(roles, 'zzz', 'archiviato').map(c => c.value)).toEqual(['a', 'b'])
  })
  it('no roles, no choices', () => {
    expect(roleChoices([], null, 'archiviato')).toEqual([])
  })
})

describe('startingRole', () => {
  it('the current role wins, even if archived', () => {
    expect(startingRole(roles, 'c')).toBe('c')
  })
  it('without a current role, the first active one', () => {
    expect(startingRole(roles, null)).toBe('a')
    expect(startingRole([role({ id: 'x', archived: true }), role({ id: 'y' })], undefined)).toBe('y')
  })
  it('empty string when there is nothing to choose, so the form can ask for one', () => {
    expect(startingRole([], null)).toBe('')
    expect(startingRole([role({ id: 'x', archived: true })], null)).toBe('')
  })
})

describe('roleCreateBody', () => {
  it('trims the name and sends the model and the availability flag', () => {
    expect(roleCreateBody({ name: '  Massaggiatore ', policyModel: 'none', mustBeAvailable: false }))
      .toEqual({ name: 'Massaggiatore', policyModel: 'none', mustBeAvailable: false })
  })
})

describe('roleEditBody', () => {
  const current = role({ id: 'a', name: 'Allenatore', policyModel: 'coach', mustBeAvailable: true })
  it('sends only what changed', () => {
    expect(roleEditBody({ name: 'Mister', policyModel: 'coach', mustBeAvailable: true }, current)).toEqual({ name: 'Mister' })
    expect(roleEditBody({ name: 'Allenatore', policyModel: 'trainer', mustBeAvailable: false }, current))
      .toEqual({ policyModel: 'trainer', mustBeAvailable: false })
  })
  it('compares the trimmed name', () => {
    expect(roleEditBody({ name: ' Allenatore ', policyModel: 'coach', mustBeAvailable: true }, current)).toEqual({})
  })
  it('nothing changed, empty body', () => {
    expect(roleEditBody({ name: 'Allenatore', policyModel: 'coach', mustBeAvailable: true }, current)).toEqual({})
  })
})
