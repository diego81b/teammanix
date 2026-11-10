import { describe, expect, it } from 'vitest'
import {
  MAX_MATCHES, addCompetition, canSuspendOn, forPerson, byUrgency, nextMatchNumber, progress, removeCompetition, splitSuspensions, suggestions, suspensionError, suspensionPayload,
  type SuspensionDraft,
} from '../../app/utils/suspension'
import type { SeasonSuspension } from '../../app/types/api'

const season = { seasonStart: '2026-09-01', seasonEnd: '2027-06-30' }
const draft = (over: Partial<SuspensionDraft> = {}): SuspensionDraft => ({
  form: 'matches', startDate: '2026-11-10', matchCount: 2, endDate: '', competitions: [], ...over,
})

describe('suspensionError', () => {
  it('accepts a matches suspension and a period inside the season', () => {
    expect(suspensionError(draft(), season)).toBeNull()
    expect(suspensionError(draft({ form: 'period', matchCount: null, endDate: '2026-11-20' }), season)).toBeNull()
  })
  it('asks for the start day', () => {
    expect(suspensionError(draft({ startDate: '' }), season)).toBe('startRequired')
  })
  it('matches: the count is a whole number from 1 to the maximum', () => {
    for (const n of [null, 0, -1, 1.5, MAX_MATCHES + 1]) expect(suspensionError(draft({ matchCount: n }), season)).toBe('countInvalid')
    expect(suspensionError(draft({ matchCount: MAX_MATCHES }), season)).toBeNull()
  })
  it('period: the end is required and not before the start', () => {
    expect(suspensionError(draft({ form: 'period', endDate: '' }), season)).toBe('endRequired')
    expect(suspensionError(draft({ form: 'period', endDate: '2026-11-09' }), season)).toBe('endBeforeStart')
    expect(suspensionError(draft({ form: 'period', endDate: '2026-11-10' }), season)).toBeNull()
  })
  it('stays inside the season', () => {
    expect(suspensionError(draft({ startDate: '2026-08-31' }), season)).toBe('outsideSeason')
    expect(suspensionError(draft({ startDate: '2027-07-01' }), season)).toBe('outsideSeason')
    expect(suspensionError(draft({ form: 'period', endDate: '2027-07-01' }), season)).toBe('outsideSeason')
  })
  it('an end left over from the other form is ignored', () => {
    expect(suspensionError(draft({ form: 'matches', endDate: '2020-01-01' }), season)).toBeNull()
  })
})

describe('suspensionPayload', () => {
  it('matches: count and competitions, no end', () => {
    expect(suspensionPayload(draft({ competitions: ['Cup'], endDate: '2026-12-01' }))).toEqual({ form: 'matches', startDate: '2026-11-10', matchCount: 2, competitions: ['Cup'] })
  })
  it('period: end, no count and no competitions', () => {
    expect(suspensionPayload(draft({ form: 'period', matchCount: 3, endDate: '2026-11-20', competitions: ['Cup'] }))).toEqual({ form: 'period', startDate: '2026-11-10', endDate: '2026-11-20' })
  })
  it('born from a match: the match is the origin and no start day is sent', () => {
    expect(suspensionPayload(draft({ competitions: [] }), 'e1')).toEqual({ form: 'matches', matchCount: 2, competitions: [], originEventId: 'e1' })
  })
})

describe('competitions', () => {
  it('adds a trimmed name once, ignoring case and extra spaces', () => {
    expect(addCompetition(['League'], '  cup ')).toEqual(['League', 'cup'])
    expect(addCompetition(['League'], ' LEAGUE  ')).toEqual(['League'])
    expect(addCompetition(['League'], '   ')).toEqual(['League'])
  })
  it('removes by name', () => {
    expect(removeCompetition(['League', 'Cup'], 'League')).toEqual(['Cup'])
  })
  it('suggests the season names not chosen yet', () => {
    expect(suggestions(['League', 'Cup', 'Friendly'], ['cup'])).toEqual(['League', 'Friendly'])
  })
})

describe('progress', () => {
  const s = (over: Partial<SeasonSuspension> = {}) => ({
    id: 's1', enrollmentId: 'i1', form: 'matches', startDate: '2026-11-10', matchCount: 3, endDate: null, competitions: [], originEventId: null,
    covered: [], served: 1, remaining: 2, completed: false, personId: 'p1', name: 'Anna', surname: null, type: 'player', ...over,
  }) as SeasonSuspension

  it('matches: served of the count', () => {
    expect(progress(s())).toEqual({ served: 1, total: 3 })
  })
  it('period: served of the matches the period covers', () => {
    expect(progress(s({ form: 'period', matchCount: null, endDate: '2026-11-30', served: 1, remaining: 2, covered: [{ eventId: 'a', start: '', number: 1, of: 3, served: true }, { eventId: 'b', start: '', number: 2, of: 3, served: false }, { eventId: 'c', start: '', number: 3, of: 3, served: false }] })))
      .toEqual({ served: 1, total: 3 })
  })
})

describe('splitSuspensions and byUrgency', () => {
  const s = (id: string, startDate: string, completed: boolean, over: Partial<SeasonSuspension> = {}) => ({ id, startDate, completed, ...over }) as SeasonSuspension

  it('open ones first by start, completed ones after, most recent first', () => {
    const r = splitSuspensions([s('a', '2026-10-01', true), s('b', '2026-12-01', false), s('c', '2026-11-01', false), s('d', '2026-10-15', true)])
    expect(r.open.map(x => x.id)).toEqual(['c', 'b'])
    expect(r.completed.map(x => x.id)).toEqual(['d', 'a'])
  })
  it('byUrgency puts the one with fewer matches left first', () => {
    const list = [s('a', '', false, { remaining: 3 }), s('b', '', false, { remaining: 1 })]
    expect([...list].sort(byUrgency).map(x => x.id)).toEqual(['b', 'a'])
  })
})

describe('nextMatchNumber', () => {
  it('is the first not served match, from 1', () => {
    const c = (served: boolean, number: number) => ({ eventId: `e${number}`, start: '', number, of: 3, served })
    expect(nextMatchNumber([c(true, 1), c(false, 2), c(false, 3)])).toBe(2)
    expect(nextMatchNumber([c(true, 1)])).toBeNull()
    expect(nextMatchNumber([])).toBeNull()
  })
})

describe('canSuspendOn', () => {
  it('is open for a live enrollment of an active person', () => {
    expect(canSuspendOn({ endedAt: null }, false)).toBe(true)
  })
  it('is closed for an ended enrollment or a disabled person', () => {
    expect(canSuspendOn({ endedAt: '2026-06-30' }, false)).toBe(false)
    expect(canSuspendOn({ endedAt: null }, true)).toBe(false)
  })
})

describe('forPerson', () => {
  it('turns a suspension of one enrollment into the team list shape, so the form can edit it', () => {
    const s = { id: 'x1', enrollmentId: 'i1', form: 'matches', startDate: '2026-11-10', matchCount: 2, endDate: null, competitions: [], originEventId: null, covered: [], served: 0, remaining: 2, completed: false } as const
    const out = forPerson(s, { id: 'p1', name: 'Anna', surname: 'Rossi', type: 'player' })
    expect(out).toEqual({ ...s, personId: 'p1', name: 'Anna', surname: 'Rossi', type: 'player' })
  })
})
