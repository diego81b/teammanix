import type { EventDto, EventType, SeriesDto, Weekday } from '../types/api'
import { splitInstant, type EventForm } from './event'

export const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
export const MAX_INTERVAL_WEEKS = 52

/** Repeat part of the event form. */
export interface RepeatForm {
  on: boolean
  weekdays: Weekday[]
  intervalWeeks: number
  /** `YYYY-MM-DD`, empty = until the end of the season. */
  endDate: string
}

/** "Only this one" is an event edit, "all future ones" a series edit. */
export type EditScope = 'one' | 'future'

export type RepeatIssue = 'weekdays_missing' | 'interval' | 'end_before_start'

const pad = (n: number) => String(n).padStart(2, '0')

/** Weekday of a calendar day, null if it is not a real day. */
export function weekdayOf(day: string): Weekday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) return null
  return WEEKDAYS[(d.getUTCDay() + 6) % 7] ?? null
}

/** Minutes from `HH:mm` to `HH:mm` inside one day, null if a time is missing or the end is not after the start. */
export function minutesBetween(start: string, end: string): number | null {
  const m = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null)
  const a = m(start)
  const b = m(end)
  return a === null || b === null || b <= a ? null : b - a
}

/** `HH:mm` plus minutes, wrapping at midnight. */
function addMinutes(time: string, minutes: number): string {
  const total = (Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + minutes) % (24 * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** Off by default, with the weekday of the chosen day selected so one tap is enough for "every week". */
export function emptyRepeat(date = ''): RepeatForm {
  const weekday = weekdayOf(date)
  return { on: false, weekdays: weekday ? [weekday] : [], intervalWeeks: 1, endDate: '' }
}

/** Same checks the API makes on the shape, to answer before the call. The API stays the authority (and checks the season dates). */
export function repeatIssue(f: EventForm, r: RepeatForm): RepeatIssue | null {
  if (!r.on) return null
  if (r.weekdays.length === 0) return 'weekdays_missing'
  if (!Number.isInteger(r.intervalWeeks) || r.intervalWeeks < 1 || r.intervalWeeks > MAX_INTERVAL_WEEKS) return 'interval'
  if (r.endDate && f.date && r.endDate < f.date) return 'end_before_start'
  return null
}

export interface SeriesCreatePayload {
  type: Exclude<EventType, 'match'>
  title: string | null
  venueId: string | null
  weekdays: Weekday[]
  intervalWeeks: number
  startDate: string
  endDate?: string
  timeStart: string
  durationMinutes: number
}

export interface SeriesEditPayload {
  title: string | null
  venueId: string | null
  weekdays: Weekday[]
  intervalWeeks: number
  endDate: string | null
  timeStart: string
  durationMinutes: number
}

const orNull = (value: string): string | null => value.trim() || null

/** Body to create a series. A match is never repeated (it needs its own opponent). Null if the day or the times are not valid. */
export function seriesCreatePayload(f: EventForm, r: RepeatForm): SeriesCreatePayload | null {
  const durationMinutes = minutesBetween(f.startTime, f.endTime)
  if (f.type === 'match' || !weekdayOf(f.date) || durationMinutes === null) return null
  const payload: SeriesCreatePayload = {
    type: f.type,
    title: orNull(f.title),
    venueId: f.venueId || null,
    weekdays: [...r.weekdays],
    intervalWeeks: r.intervalWeeks,
    startDate: f.date,
    timeStart: f.startTime,
    durationMinutes,
  }
  if (r.endDate) payload.endDate = r.endDate
  return payload
}

/** Body for "all future ones". The type and the first day stay as they were, so the form's day is not used. */
export function seriesEditPayload(f: EventForm, r: RepeatForm): SeriesEditPayload | null {
  const durationMinutes = minutesBetween(f.startTime, f.endTime)
  if (durationMinutes === null) return null
  return {
    title: orNull(f.title),
    venueId: f.venueId || null,
    weekdays: [...r.weekdays],
    intervalWeeks: r.intervalWeeks,
    endDate: r.endDate || null,
    timeStart: f.startTime,
    durationMinutes,
  }
}

/** Form and repeat to edit "all future ones": the series' values, shown on the day of the session being edited. */
export function formFromSeries(s: SeriesDto, e: EventDto): { form: EventForm, repeat: RepeatForm } {
  return {
    form: {
      type: s.type,
      title: s.title ?? '',
      date: splitInstant(e.start).date,
      startTime: s.timeStart,
      endTime: addMinutes(s.timeStart, s.durationMinutes),
      venueId: s.venue?.id ?? '',
      note: '',
      opponent: '',
      homeAway: '',
      competition: '',
    },
    repeat: { on: true, weekdays: [...s.weekdays], intervalWeeks: s.intervalWeeks, endDate: s.endDate },
  }
}
