import { describe, expect, it } from 'vitest'
import {
  calendarChoices,
  calendarPath,
  defaultCalendarPath,
  eventHeading,
  eventsByDay,
  initialMonth,
  monthGrid,
  monthOf,
  shiftMonth,
  splitHistory,
  todayDay,
} from '../../app/utils/calendar'
import type { CalendarSeasonDto, EventDto } from '../../app/types/api'

const event = (over: Partial<EventDto> = {}): EventDto => ({
  id: 'e1', seasonId: 's1', teamId: 't1', type: 'training', title: null,
  start: '2026-10-06T16:00:00.000Z', end: '2026-10-06T17:30:00.000Z', venue: null, note: null,
  status: 'scheduled', opponent: null, homeAway: null, competition: null, seriesId: null, exception: false, ...over,
})

const season = (over: Partial<CalendarSeasonDto> = {}): CalendarSeasonDto => ({
  seasonId: 's1', seasonName: '2026/27', seasonStatus: 'active', teamId: 't1', teamName: 'U14', activityName: 'Football', ...over,
})

describe('monthOf and shiftMonth', () => {
  it('reads year and month from a day', () => expect(monthOf('2026-10-06')).toEqual({ year: 2026, month: 10 }))
  it('moves across year boundaries', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 })
    expect(shiftMonth({ year: 2026, month: 5 }, 14)).toEqual({ year: 2027, month: 7 })
  })
})

describe('monthGrid: weeks starting on Monday', () => {
  it('October 2026 starts on a Thursday and fills five weeks', () => {
    const weeks = monthGrid({ year: 2026, month: 10 })
    expect(weeks).toHaveLength(5)
    expect(weeks.every(w => w.length === 7)).toBe(true)
    expect(weeks[0]![0]).toEqual({ day: '2026-09-28', inMonth: false })
    expect(weeks[0]![3]).toEqual({ day: '2026-10-01', inMonth: true })
    expect(weeks[4]![6]).toEqual({ day: '2026-11-01', inMonth: false })
  })
  it('February 2027 starts on a Monday and ends on a Sunday: exactly four weeks', () => {
    const weeks = monthGrid({ year: 2027, month: 2 })
    expect(weeks).toHaveLength(4)
    expect(weeks[0]![0]).toEqual({ day: '2027-02-01', inMonth: true })
    expect(weeks[3]![6]).toEqual({ day: '2027-02-28', inMonth: true })
  })
  it('a month can need six weeks', () => {
    const weeks = monthGrid({ year: 2026, month: 8 })
    expect(weeks).toHaveLength(6)
    expect(weeks[0]![0]!.day).toBe('2026-07-27')
    expect(weeks[5]![6]!.day).toBe('2026-09-06')
  })
  it('crosses the daylight saving change without skipping or repeating a day', () => {
    const days = monthGrid({ year: 2026, month: 10 }).flat().map(c => c.day)
    expect(new Set(days).size).toBe(days.length)
    expect(days).toContain('2026-10-25')
    expect(days).toContain('2026-10-26')
  })
})

describe('eventsByDay', () => {
  it('groups by local day keeping the given order', () => {
    const a = event({ id: 'a', start: '2026-10-06T08:00:00.000Z', end: '2026-10-06T09:00:00.000Z' })
    const b = event({ id: 'b', start: '2026-10-06T10:00:00.000Z', end: '2026-10-06T11:00:00.000Z' })
    const c = event({ id: 'c', start: '2026-10-08T10:00:00.000Z', end: '2026-10-08T11:00:00.000Z' })
    const grouped = eventsByDay([a, b, c])
    expect(grouped.get('2026-10-06')?.map(e => e.id)).toEqual(['a', 'b'])
    expect(grouped.get('2026-10-08')?.map(e => e.id)).toEqual(['c'])
    expect(grouped.get('2026-10-07')).toBeUndefined()
  })
})

describe('splitHistory', () => {
  const now = new Date('2026-11-09T12:00:00.000Z')
  const at = (id: string, start: string, end: string, status: EventDto['status'] = 'scheduled') => event({ id, start, end, status })

  it('puts events that have not ended in upcoming (ascending) and the rest in history (latest first)', () => {
    const past1 = at('p1', '2026-10-01T16:00:00.000Z', '2026-10-01T17:00:00.000Z')
    const past2 = at('p2', '2026-11-05T16:00:00.000Z', '2026-11-05T17:00:00.000Z')
    const running = at('r', '2026-11-09T11:30:00.000Z', '2026-11-09T12:30:00.000Z')
    const next = at('n', '2026-11-12T16:00:00.000Z', '2026-11-12T17:00:00.000Z')
    const { upcoming, history } = splitHistory([past1, past2, running, next], now)
    expect(upcoming.map(e => e.id)).toEqual(['r', 'n'])
    expect(history.map(e => e.id)).toEqual(['p2', 'p1'])
  })
  it('an event ending exactly now is history', () => {
    const { upcoming, history } = splitHistory([at('x', '2026-11-09T11:00:00.000Z', '2026-11-09T12:00:00.000Z')], now)
    expect([upcoming.length, history.length]).toEqual([0, 1])
  })
  it('cancelled and postponed events follow their dates', () => {
    const { upcoming } = splitHistory([at('c', '2026-11-12T16:00:00.000Z', '2026-11-12T17:00:00.000Z', 'cancelled')], now)
    expect(upcoming.map(e => e.id)).toEqual(['c'])
  })
})

describe('todayDay', () => {
  it('is the local day of the instant', () => {
    const d = new Date(2026, 10, 9, 23, 30)
    expect(todayDay(d)).toBe('2026-11-09')
  })
})

describe('eventHeading', () => {
  const t = (key: string) => `[${key}]`
  it('prefers the title, then the opponent of a match, then the type', () => {
    expect(eventHeading(event({ title: 'Warm up' }), t)).toBe('Warm up')
    expect(eventHeading(event({ type: 'match', opponent: { id: 'o', name: 'Virtus' } }), t)).toBe('[events.type.match]: Virtus')
    expect(eventHeading(event({ type: 'other' }), t)).toBe('[events.type.other]')
  })
})

describe('calendar choices', () => {
  const s1 = season()
  const s2 = season({ seasonId: 's2', teamName: 'U16' })

  it('offers the personal calendar only if it has events, then every team season', () => {
    expect(calendarChoices([s1, s2], true).map(c => c.value)).toEqual(['me', 's1', 's2'])
    expect(calendarChoices([s1, s2], false).map(c => c.value)).toEqual(['s1', 's2'])
    expect(calendarChoices([], false)).toEqual([])
  })
  it('maps a choice to its page', () => {
    expect(calendarPath('me')).toBe('/calendar')
    expect(calendarPath('s1')).toBe('/calendar/s1')
  })
  it('the default page is the personal calendar, else the first team, else none', () => {
    expect(defaultCalendarPath(true, [s1])).toBe('/calendar')
    expect(defaultCalendarPath(false, [s1, s2])).toBe('/calendar/s1')
    expect(defaultCalendarPath(false, [])).toBeNull()
  })
})

describe('initialMonth: the month the month view opens on', () => {
  const now = new Date(2026, 10, 9, 12, 0) // 9 November 2026, local
  const at = (id: string, start: string, end: string) => event({ id, start, end })
  const nov = at('nov', '2026-11-20T16:00:00.000Z', '2026-11-20T17:00:00.000Z')
  const mar = at('mar', '2027-03-10T16:00:00.000Z', '2027-03-10T17:00:00.000Z')
  const jun = at('jun', '2026-06-10T16:00:00.000Z', '2026-06-10T17:00:00.000Z')

  it('is the current month when it has events', () => expect(initialMonth([jun, nov], now)).toEqual({ year: 2026, month: 11 }))
  it('else the month of the next event', () => expect(initialMonth([jun, mar], now)).toEqual({ year: 2027, month: 3 }))
  it('else the month of the latest event of the history', () => expect(initialMonth([jun], now)).toEqual({ year: 2026, month: 6 }))
  it('with no events it is the current month', () => expect(initialMonth([], now)).toEqual({ year: 2026, month: 11 }))
})
