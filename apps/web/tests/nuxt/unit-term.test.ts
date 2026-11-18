import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import type { Membership } from '../../app/types/api'

const admin: Membership = {
  clubId: 'c1',
  name: 'ASD Test',
  roles: [{ role: 'admin', scope: 'club', sectionId: null, teamId: null }],
  linkedToPerson: false,
  recordToComplete: false,
}
const manager: Membership = { ...admin, clubId: 'c2', roles: [{ role: 'manager', scope: 'team', sectionId: null, teamId: 'q1' }] }

const profiles = [
  { code: 'fencing', unitTerm: 'group' },
  { code: 'football', unitTerm: 'team' },
]
const calls: string[] = []
let teams: { sportProfile: string }[] = []
let structureStatus = 200

registerEndpoint('/api/structure', () => {
  calls.push('structure')
  return structureStatus === 200 ? { sections: [], teams } : new Response('{}', { status: structureStatus, headers: { 'content-type': 'application/json' } })
})
registerEndpoint('/api/sport-profiles', () => {
  calls.push('profiles')
  return profiles
})

function login(m: Membership) {
  const s = useSessionStore()
  s.token = 'tok'
  s.memberships = [m]
  s.activeClubId = m.clubId
}

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  useSessionStore().clear()
  useUnitStore().term = 'team'
  calls.length = 0
  teams = []
  structureStatus = 200
})

describe('unit store', () => {
  it('says team before anything is loaded', () => {
    expect(useUnitStore().term).toBe('team')
  })

  it('says group for an admin when every team is a group', async () => {
    login(admin)
    teams = [{ sportProfile: 'fencing' }, { sportProfile: 'fencing' }]
    const unit = useUnitStore()
    await unit.refresh()
    expect(unit.term).toBe('group')
  })

  it('says team for a mix, for football and for a club with no teams', async () => {
    login(admin)
    const unit = useUnitStore()
    teams = [{ sportProfile: 'fencing' }, { sportProfile: 'football' }]
    await unit.refresh()
    expect(unit.term).toBe('team')
    teams = [{ sportProfile: 'football' }]
    await unit.refresh()
    expect(unit.term).toBe('team')
    teams = []
    await unit.refresh()
    expect(unit.term).toBe('team')
  })

  it('loads nothing for a non admin and says team', async () => {
    login(manager)
    const unit = useUnitStore()
    unit.term = 'group'
    await unit.refresh()
    expect(unit.term).toBe('team')
    expect(calls).toEqual([])
  })

  it('loads nothing without a session', async () => {
    const unit = useUnitStore()
    await unit.refresh()
    expect(calls).toEqual([])
  })

  it('falls back to team when the structure request fails, without throwing', async () => {
    login(admin)
    const unit = useUnitStore()
    teams = [{ sportProfile: 'fencing' }]
    await unit.refresh()
    expect(unit.term).toBe('group')
    structureStatus = 500
    await expect(unit.refresh()).resolves.toBeUndefined()
    expect(unit.term).toBe('team')
  })

  it('takes the term from a tree and profiles a page already loaded, with no request', () => {
    const unit = useUnitStore()
    unit.apply([{ sportProfile: 'fencing' }], profiles as never)
    expect(unit.term).toBe('group')
    unit.apply([], profiles as never)
    expect(unit.term).toBe('team')
    expect(calls).toEqual([])
  })

  it('keeps the answer of the last refresh when two overlap', async () => {
    login(admin)
    const unit = useUnitStore()
    teams = [{ sportProfile: 'football' }]
    const first = unit.refresh()
    teams = [{ sportProfile: 'fencing' }]
    const second = unit.refresh()
    await Promise.all([first, second])
    expect(unit.term).toBe('group')
  })
})
