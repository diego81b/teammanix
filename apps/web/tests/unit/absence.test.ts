import { describe, expect, it } from 'vitest'
import { canFree, formPayload, freedPeriods, freeError, freePayload, isPast, ownInjury, periodError, pickAll, splitAbsences, splitTeamAbsences, toggleEvent } from '../../app/utils/absence'

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

describe('freeError', () => {
  const today = '2026-12-01'
  const free = (over: Partial<{ startDate: string, endDate: string, onward: boolean }> = {}) => ({ startDate: '2026-12-10', endDate: '2026-12-12', onward: false, ...over })

  it('accepts a range from today on, with an end or onward', () => {
    expect(freeError(free(), today)).toBeNull()
    expect(freeError(free({ endDate: '', onward: true }), today)).toBeNull()
    expect(freeError(free({ startDate: today, endDate: today }), today)).toBeNull()
  })

  it('asks for the first day, and for the last unless it is onward', () => {
    expect(freeError(free({ startDate: '' }), today)).toBe('startRequired')
    expect(freeError(free({ endDate: '' }), today)).toBe('endRequired')
  })

  it('an end before the start is refused, an end typed before switching to onward is ignored', () => {
    expect(freeError(free({ endDate: '2026-12-09' }), today)).toBe('endBeforeStart')
    expect(freeError(free({ endDate: '2020-01-01', onward: true }), today)).toBeNull()
  })

  it('a day before today is refused: the past never changes', () => {
    expect(freeError(free({ startDate: '2026-11-30' }), today)).toBe('inPast')
    expect(freeError(free({ startDate: '2026-11-30', onward: true }), today)).toBe('inPast')
  })
})

describe('freePayload', () => {
  it('sends null as the end when freeing from a day onward', () => {
    expect(freePayload({ startDate: '2026-12-10', endDate: '2026-12-12', onward: false })).toEqual({ startDate: '2026-12-10', endDate: '2026-12-12' })
    expect(freePayload({ startDate: '2026-12-10', endDate: '2026-12-12', onward: true })).toEqual({ startDate: '2026-12-10', endDate: null })
  })
})

describe('freedPeriods', () => {
  const p = (startDate: string, endDate: string | null) => ({ startDate, endDate })
  const range = (startDate: string, endDate: string, onward = false) => ({ startDate, endDate, onward })

  it('splits a period when the freed days are in the middle', () => {
    expect(freedPeriods([p('2026-12-01', '2026-12-20')], range('2026-12-10', '2026-12-12'))).toEqual({
      after: [p('2026-12-01', '2026-12-09'), p('2026-12-13', '2026-12-20')],
      changed: true,
    })
  })

  it('shortens a period at either end and removes one that is fully inside', () => {
    expect(freedPeriods([p('2026-12-01', '2026-12-20')], range('2026-12-18', '2026-12-20')).after).toEqual([p('2026-12-01', '2026-12-17')])
    expect(freedPeriods([p('2026-12-05', '2026-12-20')], range('2026-12-03', '2026-12-08')).after).toEqual([p('2026-12-09', '2026-12-20')])
    expect(freedPeriods([p('2026-12-01', '2026-12-20'), p('2026-12-05', '2026-12-05')], range('2026-12-01', '2026-12-20')).after).toEqual([])
  })

  it('keeps an absence until further notice open ended on the second part, and ends it the day before when freed onward', () => {
    expect(freedPeriods([p('2026-12-01', null)], range('2026-12-10', '2026-12-12')).after).toEqual([p('2026-12-01', '2026-12-09'), p('2026-12-13', null)])
    expect(freedPeriods([p('2026-12-01', null)], range('2026-12-10', '', true)).after).toEqual([p('2026-12-01', '2026-12-09')])
  })

  it('frees a day covered by two overlapping periods from both', () => {
    const { after } = freedPeriods([p('2026-12-01', '2026-12-10'), p('2026-12-08', '2026-12-20')], range('2026-12-09', '2026-12-09'))
    expect(after.some(a => a.startDate <= '2026-12-09' && (a.endDate === null || a.endDate >= '2026-12-09'))).toBe(false)
    expect(after.some(a => a.startDate <= '2026-12-10' && (a.endDate === null || a.endDate >= '2026-12-10'))).toBe(true)
  })

  it('says nothing changes when no declared day is in the range, and keeps the list sorted', () => {
    const r = freedPeriods([p('2026-12-20', '2026-12-25'), p('2026-12-01', '2026-12-05')], range('2026-12-10', '2026-12-12'))
    expect(r.changed).toBe(false)
    expect(r.after).toEqual([p('2026-12-01', '2026-12-05'), p('2026-12-20', '2026-12-25')])
  })

  it('does not touch the list it is given', () => {
    const input = [p('2026-12-01', '2026-12-20')]
    const copy = JSON.parse(JSON.stringify(input))
    freedPeriods(input, range('2026-12-10', '2026-12-12'))
    expect(input).toEqual(copy)
  })
})

describe('canFree', () => {
  it('is offered only when some absence still has days from today on', () => {
    const today = '2026-12-01'
    expect(canFree([{ id: 'a', startDate: '2026-11-01', endDate: '2026-11-30' }], today)).toBe(false)
    expect(canFree([{ id: 'a', startDate: '2026-11-01', endDate: '2026-12-01' }], today)).toBe(true)
    expect(canFree([{ id: 'a', startDate: '2026-11-01', endDate: null }], today)).toBe(true)
    expect(canFree([], today)).toBe(false)
  })
})

describe('ownInjury: what the player reads of their own state (#21)', () => {
  const p = { startDate: '2026-11-10', returnDate: '2026-11-24' }
  const e = (o: object) => ({ type: 'player' as const, status: 'available' as const, expectedInjury: null, ...o })

  it('nothing for a fit player or for staff', () => {
    expect(ownInjury([e({})])).toBeNull()
    expect(ownInjury([e({ type: 'staff', expectedInjury: p })])).toBeNull()
    expect(ownInjury([])).toBeNull()
  })
  it('the expected period, with its dates', () => {
    expect(ownInjury([e({ type: 'staff' }), e({ expectedInjury: p })])).toEqual({ kind: 'expected', period: p })
  })
  it('a confirmed injury wins over the period', () => {
    expect(ownInjury([e({ expectedInjury: p }), e({ status: 'injured' })])).toEqual({ kind: 'injured' })
  })
})
