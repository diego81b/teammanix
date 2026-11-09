import { describe, expect, it } from 'vitest'
import {
  emptyRepeat,
  formFromSeries,
  minutesBetween,
  repeatIssue,
  seriesCreatePayload,
  seriesEditPayload,
  weekdayOf,
  type RepeatForm,
} from '../../app/utils/series'
import type { EventForm } from '../../app/utils/event'
import type { EventDto, SeriesDto } from '../../app/types/api'

const form = (over: Partial<EventForm> = {}): EventForm => ({
  type: 'training', title: '', date: '2026-10-06', startTime: '18:00', endTime: '19:30',
  venueId: '', note: '', opponent: '', homeAway: '', competition: '', ...over,
})
const repeat = (over: Partial<RepeatForm> = {}): RepeatForm => ({ on: true, weekdays: ['TU', 'TH'], intervalWeeks: 1, endDate: '', ...over })

const series = (over: Partial<SeriesDto> = {}): SeriesDto => ({
  id: 'sr1', seasonId: 's1', teamId: 't1', type: 'training', title: 'Team training', venue: { id: 'v1', name: 'Campo A' },
  weekdays: ['TU', 'TH'], intervalWeeks: 2, startDate: '2026-10-05', endDate: '2027-06-30', timeStart: '18:00', durationMinutes: 90, eventCount: 30, ...over,
})

describe('weekdayOf', () => {
  it('names the weekday of a local day', () => {
    expect(weekdayOf('2026-10-06')).toBe('TU')
    expect(weekdayOf('2026-10-11')).toBe('SU')
    expect(weekdayOf('2026-10-05')).toBe('MO')
  })
  it('gives null for anything that is not a real day', () => {
    expect(weekdayOf('')).toBeNull()
    expect(weekdayOf('2026-02-30')).toBeNull()
  })
})

describe('minutesBetween', () => {
  it('counts the minutes inside the day', () => {
    expect(minutesBetween('18:00', '19:30')).toBe(90)
    expect(minutesBetween('09:15', '09:16')).toBe(1)
  })
  it('is null when the end is not after the start or a time is missing', () => {
    expect(minutesBetween('19:30', '18:00')).toBeNull()
    expect(minutesBetween('18:00', '18:00')).toBeNull()
    expect(minutesBetween('', '18:00')).toBeNull()
  })
})

describe('emptyRepeat', () => {
  it('starts off, with the weekday of the chosen day selected', () => {
    expect(emptyRepeat('2026-10-06')).toEqual({ on: false, weekdays: ['TU'], intervalWeeks: 1, endDate: '' })
  })
  it('selects nothing when there is no day yet', () => {
    expect(emptyRepeat('').weekdays).toEqual([])
  })
})

describe('repeatIssue', () => {
  it('a valid weekly repeat has no issue, with or without an end date', () => {
    expect(repeatIssue(form(), repeat())).toBeNull()
    expect(repeatIssue(form(), repeat({ endDate: '2026-12-22' }))).toBeNull()
  })
  it('needs at least one weekday', () => {
    expect(repeatIssue(form(), repeat({ weekdays: [] }))).toBe('weekdays_missing')
  })
  it('the interval is a whole number of weeks from 1 to 52', () => {
    for (const intervalWeeks of [0, 53, 1.5, Number.NaN]) expect(repeatIssue(form(), repeat({ intervalWeeks }))).toBe('interval')
  })
  it('the end date cannot come before the first day', () => {
    expect(repeatIssue(form(), repeat({ endDate: '2026-10-05' }))).toBe('end_before_start')
    expect(repeatIssue(form(), repeat({ endDate: '2026-10-06' }))).toBeNull()
  })
  it('is ignored while the repeat is off', () => {
    expect(repeatIssue(form(), repeat({ on: false, weekdays: [] }))).toBeNull()
  })
})

describe('seriesCreatePayload', () => {
  it('maps the form to the series body, without an end date when none is given', () => {
    expect(seriesCreatePayload(form({ title: ' Team training ', venueId: 'v1' }), repeat({ intervalWeeks: 2 }))).toEqual({
      type: 'training', title: 'Team training', venueId: 'v1', weekdays: ['TU', 'TH'], intervalWeeks: 2,
      startDate: '2026-10-06', timeStart: '18:00', durationMinutes: 90,
    })
  })
  it('sends the end date when given and null for no title or venue', () => {
    const p = seriesCreatePayload(form(), repeat({ endDate: '2026-12-22' }))
    expect(p).toMatchObject({ title: null, venueId: null, endDate: '2026-12-22' })
  })
  it('works for the other type and never for a match', () => {
    expect(seriesCreatePayload(form({ type: 'other' }), repeat())?.type).toBe('other')
    expect(seriesCreatePayload(form({ type: 'match' }), repeat())).toBeNull()
  })
  it('is null when times or day are missing or the end is not after the start', () => {
    expect(seriesCreatePayload(form({ date: '' }), repeat())).toBeNull()
    expect(seriesCreatePayload(form({ endTime: '17:00' }), repeat())).toBeNull()
  })
})

describe('seriesEditPayload', () => {
  it('sends what the series changes, with null to clear the end date, the title and the venue', () => {
    expect(seriesEditPayload(form({ startTime: '19:00', endTime: '20:00' }), repeat({ weekdays: ['MO'], intervalWeeks: 3 }))).toEqual({
      title: null, venueId: null, weekdays: ['MO'], intervalWeeks: 3, endDate: null, timeStart: '19:00', durationMinutes: 60,
    })
  })
  it('keeps an end date when set', () => {
    expect(seriesEditPayload(form(), repeat({ endDate: '2026-12-22' }))?.endDate).toBe('2026-12-22')
  })
  it('does not need the day of the form', () => {
    expect(seriesEditPayload(form({ date: '' }), repeat())).not.toBeNull()
  })
  it('is null when the end is not after the start', () => {
    expect(seriesEditPayload(form({ endTime: '18:00' }), repeat())).toBeNull()
  })
})

describe('formFromSeries', () => {
  const event = { id: 'e1', start: '2026-10-06T16:00:00.000Z' } as EventDto

  it('fills the form and the repeat from the series and the session being edited', () => {
    const { form: f, repeat: r } = formFromSeries(series(), event)
    expect(f).toMatchObject({ type: 'training', title: 'Team training', startTime: '18:00', endTime: '19:30', venueId: 'v1' })
    expect(r).toEqual({ on: true, weekdays: ['TU', 'TH'], intervalWeeks: 2, endDate: '2027-06-30' })
  })
  it('ends the form time at start plus the duration, empty title and venue when the series has none', () => {
    const { form: f } = formFromSeries(series({ title: null, venue: null, timeStart: '17:30', durationMinutes: 45 }), event)
    expect(f).toMatchObject({ title: '', venueId: '', startTime: '17:30', endTime: '18:15' })
  })
})
