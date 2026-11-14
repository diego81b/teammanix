import { describe, expect, it } from 'vitest'
import {
  groupTeams, seasonContext, teamLabel, teamCreateBody, teamEditBody, validateTeam, NONE, type TeamFields,
  unitTermOf, clubUnitTerm, staffTeamChoices, filterChoices, seasonToEnroll,
} from '../../app/utils/structure'
import type { SectionDto, SportProfileDto, TeamTree } from '../../app/types/api'

const team = (id: string, sectionId: string | null, name = id): TeamTree => ({
  id, sectionId, name, sportProfile: 'football', modulesActive: [], category: null, gender: null, seasons: [],
})
const section = (id: string): SectionDto => ({ id, name: id })

const fields = (o: Partial<TeamFields> = {}): TeamFields => ({
  name: 'Under 15', sportProfile: 'football', category: '', gender: NONE, sectionId: NONE, modulesActive: [], ...o,
})

describe('groupTeams', () => {
  it('without sections the list is flat: one group with every team', () => {
    const r = groupTeams([], [team('a', null), team('b', null)])
    expect(r.grouped).toBe(false)
    expect(r.groups).toEqual([{ section: null, teams: [team('a', null), team('b', null)] }])
  })

  it('without sections and without teams there is nothing to show', () => {
    expect(groupTeams([], [])).toEqual({ grouped: false, groups: [{ section: null, teams: [] }] })
  })

  it('with sections: one group per section, empty ones included, teams without section last', () => {
    const r = groupTeams([section('s1'), section('s2')], [team('a', 's2'), team('b', null), team('c', 's1'), team('d', 's2')])
    expect(r.grouped).toBe(true)
    expect(r.groups.map(g => [g.section?.id ?? null, g.teams.map(t => t.id)])).toEqual([
      ['s1', ['c']],
      ['s2', ['a', 'd']],
      [null, ['b']],
    ])
  })

  it('with sections: no group for the teams without section when there are none', () => {
    const r = groupTeams([section('s1'), section('s2')], [team('a', 's1')])
    expect(r.groups.map(g => g.section?.id)).toEqual(['s1', 's2'])
  })

  it('a team of a section that is not in the list is shown with the ones without section', () => {
    const r = groupTeams([section('s1')], [team('a', 'gone')])
    expect(r.groups.map(g => [g.section?.id ?? null, g.teams.map(t => t.id)])).toEqual([['s1', []], [null, ['a']]])
  })
})

describe('validateTeam', () => {
  it('a valid team passes', () => expect(validateTeam(fields(), 'create')).toEqual([]))

  it('the name is required and at most 100 characters', () => {
    expect(validateTeam(fields({ name: '   ' }), 'create')).toContainEqual({ field: 'name', key: 'validation.length', params: { min: 1, max: 100 } })
    expect(validateTeam(fields({ name: 'x'.repeat(101) }), 'create')).toContainEqual({ field: 'name', key: 'validation.length', params: { min: 1, max: 100 } })
  })

  it('the category is at most 60 characters', () => {
    expect(validateTeam(fields({ category: 'x'.repeat(61) }), 'create')).toContainEqual({ field: 'category', key: 'validation.length', params: { min: 1, max: 60 } })
  })

  it('the discipline is required on creation only: the profile of a team cannot change', () => {
    expect(validateTeam(fields({ sportProfile: '' }), 'create')).toContainEqual({ field: 'sportProfile', key: 'structure.sportRequired' })
    expect(validateTeam(fields({ sportProfile: '' }), 'edit')).toEqual([])
  })
})

describe('teamCreateBody', () => {
  it('minimum: name and discipline, nothing for the section', () => {
    expect(teamCreateBody(fields())).toEqual({ name: 'Under 15', sportProfile: 'football' })
  })

  it('optional fields only when filled', () => {
    expect(teamCreateBody(fields({ name: ' U15 ', category: ' Giovanissimi ', gender: 'male', sectionId: 's1' }))).toEqual({
      name: 'U15', sportProfile: 'football', category: 'Giovanissimi', gender: 'male', sectionId: 's1',
    })
  })
})

describe('teamEditBody', () => {
  const current = team('t1', 's1', 'Under 15')
  const base = (o: Partial<TeamFields> = {}) => fields({ name: 'Under 15', sectionId: 's1', modulesActive: ['attendances'], ...o })
  const cur = { ...current, modulesActive: ['attendances'] }

  it('nothing changed: empty body', () => expect(teamEditBody(base(), cur)).toEqual({}))

  it('sends only what changed', () => {
    expect(teamEditBody(base({ name: ' Under 16 ' }), cur)).toEqual({ name: 'Under 16' })
    expect(teamEditBody(base({ category: 'Allievi' }), cur)).toEqual({ category: 'Allievi' })
    expect(teamEditBody(base({ gender: 'female' }), cur)).toEqual({ gender: 'female' })
  })

  it('moving the team to another section, or out of it (null)', () => {
    expect(teamEditBody(base({ sectionId: 's2' }), cur)).toEqual({ sectionId: 's2' })
    expect(teamEditBody(base({ sectionId: NONE }), cur)).toEqual({ sectionId: null })
  })

  it('a team without section moved into one', () => {
    expect(teamEditBody(base({ sectionId: 's1' }), { ...cur, sectionId: null })).toEqual({ sectionId: 's1' })
    expect(teamEditBody(base({ sectionId: NONE }), { ...cur, sectionId: null })).toEqual({})
  })

  it('clearing the category or the gender sends null', () => {
    expect(teamEditBody(base({ category: '' }), { ...cur, category: 'Allievi' })).toEqual({ category: null })
    expect(teamEditBody(base({ gender: NONE }), { ...cur, gender: 'male' })).toEqual({ gender: null })
  })

  it('modules: sent when the set changes, in any order', () => {
    expect(teamEditBody(base({ modulesActive: ['attendances', 'standings'] }), cur)).toEqual({ modulesActive: ['attendances', 'standings'] })
    expect(teamEditBody(base({ modulesActive: ['standings', 'attendances'] }), { ...cur, modulesActive: ['attendances', 'standings'] })).toEqual({})
  })

  it('never sends the sport profile', () => {
    expect(teamEditBody(base({ sportProfile: 'volleyball' }), cur)).toEqual({})
  })
})

describe('seasonContext', () => {
  const draft = (id: string) => ({ id, teamId: 't1', name: id, startDate: '2026-09-01', endDate: '2027-06-30', status: 'draft' as const, league: null })
  const active = (id: string) => ({ ...draft(id), status: 'active' as const })
  const tree = {
    sections: [section('s1')],
    teams: [
      { ...team('t1', 's1'), seasons: [active('a1'), draft('d1')] },
      { ...team('t2', null), seasons: [active('a2')] },
    ],
  }

  it('finds the team, its section and whether the team has a draft', () => {
    const c = seasonContext(tree, 'a1')
    expect([c?.team.id, c?.section?.id, c?.season.id, c?.hasDraft]).toEqual(['t1', 's1', 'a1', true])
  })

  it('a team without section has no section in its context', () => {
    const c = seasonContext(tree, 'a2')
    expect([c?.team.id, c?.section, c?.hasDraft]).toEqual(['t2', null, false])
  })

  it('unknown season: null', () => expect(seasonContext(tree, 'x')).toBeNull())
})

describe('teamLabel', () => {
  it('section and team when there is a section', () => expect(teamLabel('Football', 'Under 15')).toBe('Football · Under 15'))
  it('only the team when it has no section', () => expect(teamLabel(null, 'Under 15')).toBe('Under 15'))
})

const profile = (code: string, unitTerm: 'team' | 'group' = 'team'): SportProfileDto => ({
  code, positions: [], starterBench: false, maxStarters: null, modulesAvailable: [], unitTerm,
})
const profiles = [profile('football'), profile('fencing', 'group')]
const inProfile = (code: string): TeamTree => ({ ...team(code, null), sportProfile: code })

describe('unitTermOf', () => {
  it('reads the term from the profile of the discipline', () => {
    expect(unitTermOf(profiles, 'fencing')).toBe('group')
    expect(unitTermOf(profiles, 'football')).toBe('team')
  })

  it('unknown or missing profile: team', () => {
    expect(unitTermOf(profiles, 'chess')).toBe('team')
    expect(unitTermOf(profiles, null)).toBe('team')
    expect(unitTermOf([], 'fencing')).toBe('team')
  })
})

describe('clubUnitTerm', () => {
  it('group only when every team of the club is a group', () => {
    expect(clubUnitTerm(profiles, [inProfile('fencing')])).toBe('group')
    expect(clubUnitTerm(profiles, [inProfile('fencing'), inProfile('fencing')])).toBe('group')
  })

  it('football, or a mix of disciplines: team', () => {
    expect(clubUnitTerm(profiles, [inProfile('football')])).toBe('team')
    expect(clubUnitTerm(profiles, [inProfile('fencing'), inProfile('football')])).toBe('team')
  })

  it('a club without teams: team', () => expect(clubUnitTerm(profiles, [])).toBe('team'))
})

describe('seasonToEnroll', () => {
  const s = (id: string, status: 'draft' | 'active' | 'closed') => ({ id, status })

  it('the active season wins over the draft', () => expect(seasonToEnroll([s('d', 'draft'), s('a', 'active')])).toBe('a'))
  it('without an active one, the draft', () => expect(seasonToEnroll([s('c', 'closed'), s('d', 'draft')])).toBe('d'))
  it('only closed seasons or none: null', () => {
    expect(seasonToEnroll([s('c', 'closed')])).toBeNull()
    expect(seasonToEnroll([])).toBeNull()
  })
})

describe('staffTeamChoices', () => {
  const draft = (id: string, teamId: string) => ({ id, teamId, name: id, startDate: '2026-09-01', endDate: '2027-06-30', status: 'draft' as const, league: null })
  const active = (id: string, teamId: string) => ({ ...draft(id, teamId), status: 'active' as const })
  const closed = (id: string, teamId: string) => ({ ...draft(id, teamId), status: 'closed' as const })
  const tree = {
    sections: [section('s1')],
    teams: [
      { ...team('t1', 's1', 'Under 12'), seasons: [active('a1', 't1')] },
      { ...team('t2', 's1', 'Under 14'), seasons: [closed('c2', 't2'), draft('d2', 't2')] },
      { ...team('t3', null, 'First team'), seasons: [closed('c3', 't3')] },
      { ...team('t4', null, 'Veterans'), seasons: [] },
    ],
  }

  it('one choice per team, labelled with its section, free when the person is not staff there yet', () => {
    const r = staffTeamChoices(tree, [])
    expect(r.map(c => [c.id, c.label, c.sectionId, c.state])).toEqual([
      ['t1', 's1 · Under 12', 's1', 'free'],
      ['t2', 's1 · Under 14', 's1', 'free'],
      ['t3', 'First team', null, 'noSeason'],
      ['t4', 'Veterans', null, 'noSeason'],
    ])
  })

  it('a team where the person is already staff in the season that would be used is taken', () => {
    const r = staffTeamChoices(tree, [{ seasonId: 'a1', type: 'staff' }, { seasonId: 'd2', type: 'staff' }])
    expect(r.map(c => c.state)).toEqual(['taken', 'taken', 'noSeason', 'noSeason'])
  })

  it('a player enrollment does not block, nor does a staff one in a season that would not be used', () => {
    const r = staffTeamChoices(tree, [{ seasonId: 'a1', type: 'player' }, { seasonId: 'c2', type: 'staff' }])
    expect(r.map(c => c.state).slice(0, 2)).toEqual(['free', 'free'])
  })
})

describe('filterChoices', () => {
  const c = (id: string, sectionId: string | null) => ({ id, label: id, sectionId, state: 'free' as const })
  const all = [c('a', 's1'), c('b', 's2'), c('c', null)]

  it('NONE: every team', () => expect(filterChoices(all, NONE).map(x => x.id)).toEqual(['a', 'b', 'c']))
  it('a section: only its teams', () => expect(filterChoices(all, 's2').map(x => x.id)).toEqual(['b']))
})
