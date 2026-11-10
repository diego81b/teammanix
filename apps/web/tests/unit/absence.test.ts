import { describe, expect, it } from 'vitest'
import { formPayload, isPast, periodError, pickAll, splitAbsences, splitTeamAbsences, toggleEvent } from '../../app/utils/absence'

const season = { seasonStart: '2026-09-01', seasonEnd: '2027-06-30' }
const form = (over: Partial<{ startDate: string, endDate: string, untilFurtherNotice: boolean }> = {}) => ({ startDate: '2026-11-10', endDate: '2026-11-15', untilFurtherNotice: false, ...over })

describe('periodError', () => {
  it('accepts a complete period inside the season', () => {
    expect(periodError(form(), season)).toBeNull()
    expect(periodError(form({ endDate: '' , untilFurtherNotice: true }), season)).toBeNull()
  })

  it('asks for the start, and for the end unless it is until further notice', () => {
    expect(periodError(form({ startDate: '' }), season)).toBe('startRequired')
    expect(periodError(form({ endDate: '' }), season)).toBe('endRequired')
  })

  it('an end before the start is refused', () => {
    expect(periodError(form({ endDate: '2026-11-09' }), season)).toBe('endBeforeStart')
    expect(periodError(form({ endDate: '2026-11-10' }), season)).toBeNull()
  })

  it('dates outside the season are refused', () => {
    expect(periodError(form({ startDate: '2026-08-31' }), season)).toBe('outsideSeason')
    expect(periodError(form({ endDate: '2027-07-01' }), season)).toBe('outsideSeason')
    expect(periodError(form({ startDate: '2027-07-01', untilFurtherNotice: true }), season)).toBe('outsideSeason')
  })

  it('an end typed before switching to until further notice does not count', () => {
    expect(periodError(form({ endDate: '2020-01-01', untilFurtherNotice: true }), season)).toBeNull()
  })
})

describe('formPayload', () => {
  it('sends the end, or null for until further notice', () => {
    expect(formPayload(form())).toEqual({ startDate: '2026-11-10', endDate: '2026-11-15' })
    expect(formPayload(form({ untilFurtherNotice: true }))).toEqual({ startDate: '2026-11-10', endDate: null })
  })
})

describe('past and current absences', () => {
  it('an absence is past once its end day is before today', () => {
    expect(isPast({ endDate: '2026-11-09' }, '2026-11-10')).toBe(true)
    expect(isPast({ endDate: '2026-11-10' }, '2026-11-10')).toBe(false)
    expect(isPast({ endDate: null }, '2026-11-10')).toBe(false)
  })

  it('splits current and upcoming from past, each by start date', () => {
    const list = [
      { id: 'a', startDate: '2026-12-01', endDate: '2026-12-05' },
      { id: 'b', startDate: '2026-10-01', endDate: '2026-10-05' },
      { id: 'c', startDate: '2026-11-05', endDate: null },
      { id: 'd', startDate: '2026-09-10', endDate: '2026-09-12' },
    ]
    const { current, past } = splitAbsences(list, '2026-11-10')
    expect(current.map(x => x.id)).toEqual(['c', 'a'])
    expect(past.map(x => x.id)).toEqual(['b', 'd'])
  })
})

describe('events to decline', () => {
  it('starts with every event chosen, because the person is leaving for the whole period', () => {
    expect(pickAll([{ eventId: 'e1' }, { eventId: 'e2' }])).toEqual(['e1', 'e2'])
  })

  it('a tap adds or removes one event', () => {
    expect(toggleEvent(['e1', 'e2'], 'e1')).toEqual(['e2'])
    expect(toggleEvent(['e2'], 'e1')).toEqual(['e2', 'e1'])
  })
})

describe('splitTeamAbsences', () => {
  const today = '2026-11-12'
  const row = (id: string, absences: { startDate: string, endDate: string | null }[]) => ({ enrollmentId: id, personId: `p-${id}`, name: id, surname: 'Rossi', type: 'player' as const, staffRole: null, absences })

  it('lists people with a current or future absence first, soonest start first', () => {
    const { current } = splitTeamAbsences([
      row('b', [{ startDate: '2026-12-01', endDate: '2026-12-05' }]),
      row('a', [{ startDate: '2026-11-10', endDate: '2026-11-15' }]),
    ], today)
    expect(current.map(r => r.enrollmentId)).toEqual(['a', 'b'])
  })

  it('an absence without an end is current and keeps its null end', () => {
    const { current, past } = splitTeamAbsences([row('a', [{ startDate: '2026-10-01', endDate: null }])], today)
    expect(current[0]?.absences).toEqual([{ startDate: '2026-10-01', endDate: null }])
    expect(past).toEqual([])
  })

  it('an absence that ends today is still current, one that ended yesterday is past', () => {
    expect(splitTeamAbsences([row('a', [{ startDate: '2026-11-01', endDate: '2026-11-12' }])], today).current).toHaveLength(1)
    expect(splitTeamAbsences([row('a', [{ startDate: '2026-11-01', endDate: '2026-11-11' }])], today).past).toHaveLength(1)
  })

  it('a person with a past and a current period shows only the current one among the current, and is not listed as past', () => {
    const { current, past } = splitTeamAbsences([
      row('a', [{ startDate: '2026-10-01', endDate: '2026-10-05' }, { startDate: '2026-11-20', endDate: '2026-11-25' }]),
    ], today)
    expect(current[0]?.absences).toEqual([{ startDate: '2026-11-20', endDate: '2026-11-25' }])
    expect(past).toEqual([])
  })

  it('people with only past absences go to the folded list, most recent end first', () => {
    const { current, past } = splitTeamAbsences([
      row('old', [{ startDate: '2026-09-01', endDate: '2026-09-05' }]),
      row('recent', [{ startDate: '2026-11-01', endDate: '2026-11-05' }]),
    ], today)
    expect(current).toEqual([])
    expect(past.map(r => r.enrollmentId)).toEqual(['recent', 'old'])
  })

  it('nothing declared gives two empty lists', () => {
    expect(splitTeamAbsences([], today)).toEqual({ current: [], past: [] })
  })

  it('does not change the input', () => {
    const input = [row('a', [{ startDate: '2026-10-01', endDate: '2026-10-05' }, { startDate: '2026-11-20', endDate: null }])]
    const copy = JSON.parse(JSON.stringify(input))
    splitTeamAbsences(input, today)
    expect(input).toEqual(copy)
  })
})
