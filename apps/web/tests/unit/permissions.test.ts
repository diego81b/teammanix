import { describe, expect, it } from 'vitest'
import { togglePolicy, computeDiff, POLICY_GROUPS, custom } from '../../app/utils/permissions'
import type { PolicyKey, PermissionDto } from '../../app/types/api'

const base = (o: Partial<PermissionDto> = {}): PermissionDto => ({
  userId: 'u', name: 'A', surname: 'B', email: 'a@b.it', roles: [], diff: {},
  defaultValue: ['attendances.record'], effective: ['attendances.record'], editable: true, ...o,
})

describe('POLICY_GROUPS', () => {
  it('covers each policy exactly once', () => {
    const all = POLICY_GROUPS.flatMap((g) => g.policy)
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual([
      'attendances.record', 'callups.manage', 'certificates.file', 'certificates.status',
      'events.manage', 'people.disable', 'people.manage', 'suspensions.manage',
    ])
  })
  it('follows the order of the specification', () => {
    expect(POLICY_GROUPS.map((g) => g.key)).toEqual(['events', 'callups', 'attendances', 'suspensions', 'people', 'certificates'])
  })
})

describe('togglePolicy', () => {
  it('adds a missing policy', () => {
    expect(togglePolicy(['attendances.record'], 'events.manage')).toEqual(['attendances.record', 'events.manage'])
  })
  it('removes a present policy', () => {
    expect(togglePolicy(['attendances.record', 'events.manage'], 'events.manage')).toEqual(['attendances.record'])
  })
  it('does not mutate the original', () => {
    const a: PolicyKey[] = ['attendances.record']
    togglePolicy(a, 'events.manage')
    expect(a).toEqual(['attendances.record'])
  })
})

describe('computeDiff', () => {
  it('equal to the defaults: no difference', () => expect(computeDiff(['attendances.record'], ['attendances.record'])).toEqual({}))
  it('extra policy: true', () => {
    expect(computeDiff(['attendances.record'], ['attendances.record', 'events.manage'])).toEqual({ 'events.manage': true })
  })
  it('fewer policies: false', () => expect(computeDiff(['attendances.record'], [])).toEqual({ 'attendances.record': false }))
  it('combines grants and revocations', () => {
    expect(computeDiff(['attendances.record'], ['certificates.status'])).toEqual({ 'attendances.record': false, 'certificates.status': true })
  })
})

describe('custom', () => {
  it('without diff no', () => expect(custom(base())).toBe(false))
  it('with diff yes', () => expect(custom(base({ diff: { 'events.manage': true } }))).toBe(true))
})
