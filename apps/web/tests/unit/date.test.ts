import { describe, expect, it } from 'vitest'
import { formatDate, formatDay, formatMonth, weekdayLabels } from '../../app/utils/date'

describe('formatDate', () => {
  it('formats an ISO date without shifting the timezone', () => {
    expect(formatDate('2026-09-01', 'it')).toBe('01/09/2026')
    expect(formatDate('2026-12-31', 'fr')).toBe('31/12/2026')
  })
  it('English puts the day before the month', () => expect(formatDate('2026-09-01', 'en')).toBe('01/09/2026'))
  it('without a date it returns a dash', () => {
    expect(formatDate(null, 'it')).toBe('-')
    expect(formatDate('', 'it')).toBe('-')
  })
  it('also accepts a full timestamp', () => expect(formatDate('2026-09-01T10:00:00.000Z', 'it')).toBe('01/09/2026'))
})

describe('formatDay', () => {
  it('writes weekday, day and month of a local day', () => {
    expect(formatDay('2026-10-06', 'it')).toBe('martedì 6 ottobre')
    expect(formatDay('2026-10-06', 'en')).toBe('Tuesday 6 October')
  })
  it('without a valid day it returns a dash', () => expect(formatDay('', 'it')).toBe('-'))
})

describe('formatMonth and weekdayLabels', () => {
  it('names the month and year in the language', () => {
    expect(formatMonth({ year: 2026, month: 10 }, 'it')).toBe('ottobre 2026')
    expect(formatMonth({ year: 2026, month: 10 }, 'en')).toBe('October 2026')
    expect(formatMonth({ year: 2027, month: 1 }, 'fr')).toBe('janvier 2027')
  })
  it('gives seven short weekday names starting on Monday', () => {
    const it = weekdayLabels('it')
    expect(it).toHaveLength(7)
    expect(it[0]!.toLowerCase()).toMatch(/^lun/)
    expect(it[6]!.toLowerCase()).toMatch(/^dom/)
    expect(weekdayLabels('en')[0]).toBe('Mon')
  })
})
