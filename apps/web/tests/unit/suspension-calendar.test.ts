import { describe, expect, it } from 'vitest'
import { initialsOf, matchDays, weekMarks } from '../../app/utils/suspension-calendar'
import { monthGrid } from '../../app/utils/calendar'
import { splitInstant } from '../../app/utils/event'
import type { SeasonSuspension } from '../../app/types/api'

// November 2026: Sunday 1st, so the first row is Mon 26 Oct to Sun 1 Nov.
const weeks = monthGrid({ year: 2026, month: 11 })
const week = (i: number) => weeks[i]!
const noon = (day: string) => `${day}T12:00:00.000Z`

const base = { enrollmentId: 'i', competitions: [], originEventId: null, served: 0, remaining: 0, completed: false, personId: 'p', type: 'player' as const }
const period = (id: string, name: string, startDate: string, endDate: string): SeasonSuspension => ({
  ...base, id, name, surname: null, form: 'period', startDate, endDate, matchCount: null, covered: [],
} as SeasonSuspension)
const matches = (id: string, name: string, surname: string | null, days: { day: string, served?: boolean }[]): SeasonSuspension => ({
  ...base, id, name, surname, form: 'matches', startDate: days[0]!.day, endDate: null, matchCount: days.length,
  covered: days.map((d, i) => ({ eventId: `e-${d.day}`, start: noon(d.day), number: i + 1, of: days.length, served: d.served ?? false })),
} as SeasonSuspension)

describe('initialsOf', () => {
  it('takes the first letter of name and surname, upper case', () => {
    expect(initialsOf('riccardo', 'ferri')).toBe('RF')
    expect(initialsOf('Marco', null)).toBe('M')
  })
})

describe('weekMarks bars', () => {
  it('a period crossing two weeks gives one bar per week, from the start day to the end day', () => {
    // Wed 4 Nov to Tue 10 Nov: week 1 is Mon 2 to Sun 8, week 2 is Mon 9 to Sun 15.
    const s = [period('a', 'Marco', '2026-11-04', '2026-11-10')]
    expect(weekMarks(week(1), s, 'it').bars).toEqual([{ id: 'a', name: 'Marco', col: 3, span: 5, from: '2026-11-04', to: '2026-11-10' }])
    expect(weekMarks(week(2), s, 'it').bars).toEqual([{ id: 'a', name: 'Marco', col: 1, span: 2, from: '2026-11-04', to: '2026-11-10' }])
  })
  it('a week outside the period has no bar', () => {
    const s = [period('a', 'Marco', '2026-11-04', '2026-11-10')]
    expect(weekMarks(week(0), s, 'it').bars).toEqual([])
    expect(weekMarks(week(3), s, 'it').bars).toEqual([])
  })
  it('a period over a single day gives a one-column bar', () => {
    expect(weekMarks(week(1), [period('a', 'Marco', '2026-11-05', '2026-11-05')], 'it').bars).toMatchObject([{ col: 4, span: 1 }])
  })
  it('several suspensions on the same days each keep their own bar, in a stable order', () => {
    const s = [period('b', 'Zeno', '2026-11-04', '2026-11-06'), period('a', 'Anna', '2026-11-04', '2026-11-06')]
    expect(weekMarks(week(1), s, 'it').bars.map(b => b.id)).toEqual(['a', 'b'])
  })
})

describe('weekMarks initials', () => {
  it('a suspension of 2 matches marks the 2 covered days and nowhere else', () => {
    const s = [matches('m', 'Riccardo', 'Ferri', [{ day: '2026-11-07' }, { day: '2026-11-14' }])]
    expect(weekMarks(week(1), s, 'it').initials).toEqual([{ id: 'm', name: 'Riccardo Ferri', initials: 'RF', col: 6, day: '2026-11-07', served: false }])
    expect(weekMarks(week(2), s, 'it').initials).toEqual([{ id: 'm', name: 'Riccardo Ferri', initials: 'RF', col: 6, day: '2026-11-14', served: false }])
    expect(weekMarks(week(0), s, 'it').initials).toEqual([])
    expect(weekMarks(week(3), s, 'it').initials).toEqual([])
    expect(weekMarks(week(1), s, 'it').bars).toEqual([])
  })
  it('keeps a served match apart from one still to play', () => {
    const s = [matches('m', 'Riccardo', 'Ferri', [{ day: '2026-11-07', served: true }, { day: '2026-11-14' }])]
    expect(weekMarks(week(1), s, 'it').initials[0]!.served).toBe(true)
    expect(weekMarks(week(2), s, 'it').initials[0]!.served).toBe(false)
  })
  it('two people on the same match day keep both marks', () => {
    const s = [matches('a', 'Anna', 'Rossi', [{ day: '2026-11-07' }]), matches('b', 'Bruno', 'Neri', [{ day: '2026-11-07' }])]
    expect(weekMarks(week(1), s, 'it').initials.map(i => i.initials)).toEqual(['AR', 'BN'])
  })
  it('a period suspension never marks single days, even with covered matches', () => {
    const p = { ...period('a', 'Marco', '2026-11-04', '2026-11-10'), covered: [{ eventId: 'e', start: noon('2026-11-07'), number: 1, of: 1, served: false }] }
    expect(weekMarks(week(1), [p], 'it').initials).toEqual([])
  })
  it('the day follows the club-local day of the instant, like the calendar', () => {
    const start = '2026-11-07T23:30:00.000Z'
    const s = [{ ...matches('m', 'Anna', null, [{ day: '2026-11-07' }]), covered: [{ eventId: 'e', start, number: 1, of: 1, served: false }] }]
    expect(weekMarks(week(1), s, 'it').initials[0]!.day).toBe(splitInstant(start).date)
  })
})

describe('matchDays', () => {
  const e = (day: string, type: string, status: string) => ({ start: noon(day), type, status }) as never
  it('keeps the days of matches still on, played or not, and drops cancelled, postponed and other events', () => {
    const days = matchDays([
      e('2026-11-07', 'match', 'scheduled'), e('2026-11-03', 'match', 'concluded'), e('2026-11-14', 'match', 'cancelled'),
      e('2026-11-21', 'match', 'postponed'), e('2026-11-10', 'training', 'scheduled'),
    ])
    expect([...days].sort()).toEqual(['2026-11-03', '2026-11-07'])
  })
})
