import { describe, expect, it } from 'vitest'
import { NAME_MAX, POLICY_MODELS, pendingSuggestions, roleChoices, roleCreateBody, roleEditBody, roleNameKey, startingRole, suggestedBody, validRoleName } from '../../app/utils/staff-role'
import type { StaffRoleItem, SuggestedStaffRole } from '../../app/types/api'

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

describe('roleNameKey', () => {
  it('ignores case, accents and repeated spaces, like the API', () => {
    expect(roleNameKey(' Entraîneur   ADJOINT ')).toBe('entraineur adjoint')
    expect(roleNameKey('Maestro')).toBe(roleNameKey('maestro'))
  })
})

const suggestions: SuggestedStaffRole[] = [
  { code: 'master', policyModel: 'coach', mustBeAvailable: true },
  { code: 'instructor', policyModel: 'assistant_coach', mustBeAvailable: false },
]
const nameOf = (code: string) => ({ master: 'Maestro', instructor: 'Istruttore' })[code as 'master'] ?? code

describe('pendingSuggestions', () => {
  it('offers the suggested roles named in the language of the admin, with their model and flag', () => {
    expect(pendingSuggestions(suggestions, roles, nameOf)).toEqual([
      { code: 'master', name: 'Maestro', policyModel: 'coach', mustBeAvailable: true },
      { code: 'instructor', name: 'Istruttore', policyModel: 'assistant_coach', mustBeAvailable: false },
    ])
  })
  it('skips a name the club already has, archived roles and other case or accents included', () => {
    const catalog = [role({ id: 'x', name: 'MAESTRO' }), role({ id: 'y', name: 'istruttore', archived: true })]
    expect(pendingSuggestions(suggestions, catalog, nameOf)).toEqual([])
    expect(pendingSuggestions(suggestions, [role({ id: 'x', name: 'maestro' })], nameOf).map(s => s.code)).toEqual(['instructor'])
  })
  it('has nothing to offer for a profile without suggestions, or without a profile', () => {
    expect(pendingSuggestions([], roles, nameOf)).toEqual([])
    expect(pendingSuggestions(undefined, roles, nameOf)).toEqual([])
  })
})

describe('suggestedBody', () => {
  it('sends the profile and, for each chosen role, its code and name', () => {
    const chosen = pendingSuggestions(suggestions, [], nameOf).slice(0, 1)
    expect(suggestedBody('fencing', chosen)).toEqual({ sportProfile: 'fencing', roles: [{ code: 'master', name: 'Maestro' }] })
  })
})
