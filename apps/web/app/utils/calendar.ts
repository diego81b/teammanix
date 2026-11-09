import type { CalendarSeasonDto, EventDto } from '../types/api'
import { splitInstant } from './event'

/** Month as the calendar shows it. `month` is 1 to 12. */
export interface Month { year: number, month: number }

export interface MonthCell { day: string, inMonth: boolean }

const pad = (n: number) => String(n).padStart(2, '0')
/** Plain day arithmetic in UTC: a daylight saving change can never skip or repeat a day. */
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const DAY_MS = 24 * 60 * 60 * 1000

export function monthOf(day: string): Month {
  const [year, month] = day.split('-').map(Number) as [number, number]
  return { year, month }
}

export function shiftMonth(m: Month, delta: number): Month {
  const index = m.year * 12 + (m.month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** The weeks of a month, Monday first, padded with the days of the neighbouring months. */
export function monthGrid(m: Month): MonthCell[][] {
  const first = Date.UTC(m.year, m.month - 1, 1)
  const last = Date.UTC(m.year, m.month, 0)
  // getUTCDay: 0 is Sunday. Monday first means Monday is 0.
  const lead = (new Date(first).getUTCDay() + 6) % 7
  const trail = 6 - ((new Date(last).getUTCDay() + 6) % 7)
  const weeks: MonthCell[][] = []
  const prefix = `${m.year}-${pad(m.month)}`
  for (let ms = first - lead * DAY_MS; ms <= last + trail * DAY_MS; ms += DAY_MS) {
    const day = dayOf(ms)
    if (weeks.length === 0 || weeks[weeks.length - 1]!.length === 7) weeks.push([])
    weeks[weeks.length - 1]!.push({ day, inMonth: day.startsWith(prefix) })
  }
  return weeks
}

/** Events grouped by local day, keeping the given order. */
export function eventsByDay<T extends Pick<EventDto, 'start'>>(events: readonly T[]): Map<string, T[]> {
  const days = new Map<string, T[]>()
  for (const e of events) {
    const day = splitInstant(e.start).date
    days.set(day, [...(days.get(day) ?? []), e])
  }
  return days
}

/** Upcoming (not ended yet, soonest first) and history (ended, latest first). Cancelled and postponed events follow their dates. */
export function splitHistory<T extends Pick<EventDto, 'start' | 'end'>>(events: readonly T[], now: Date): { upcoming: T[], history: T[] } {
  const time = now.getTime()
  const byStart = (a: T, b: T) => new Date(a.start).getTime() - new Date(b.start).getTime()
  const upcoming = events.filter(e => new Date(e.end).getTime() > time).sort(byStart)
  const history = events.filter(e => new Date(e.end).getTime() <= time).sort((a, b) => byStart(b, a))
  return { upcoming, history }
}

/** Local day `YYYY-MM-DD` of an instant. */
export function todayDay(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Title if there is one, else opponent for a match, else the type name. `t` is the translation function. */
export function eventHeading(e: Pick<EventDto, 'title' | 'opponent' | 'type'>, t: (key: string) => string): string {
  return e.title || (e.opponent ? `${t('events.type.match')}: ${e.opponent.name}` : t(`events.type.${e.type}`))
}

export interface CalendarChoice { value: string, season?: CalendarSeasonDto }

/** Calendars to pick from: the personal one (only if it has events) and one per team season. */
export function calendarChoices(seasons: readonly CalendarSeasonDto[], hasMine: boolean): CalendarChoice[] {
  return [...(hasMine ? [{ value: 'me' }] : []), ...seasons.map(season => ({ value: season.seasonId, season }))]
}

export const calendarPath = (value: string): string => (value === 'me' ? '/calendar' : `/calendar/${value}`)

/** Where `/calendar` lands: the personal calendar if it has events, else the first team, else nowhere. */
export function defaultCalendarPath(hasMine: boolean, seasons: readonly CalendarSeasonDto[]): string | null {
  if (hasMine) return '/calendar'
  return seasons[0] ? calendarPath(seasons[0].seasonId) : null
}

/** Month the month view opens on: the current one if it has events, else the month of the next event, else of the latest one. */
export function initialMonth(events: readonly Pick<EventDto, 'start' | 'end'>[], now: Date = new Date()): Month {
  const current = monthOf(todayDay(now))
  const monthOfEvent = (e: Pick<EventDto, 'start'>) => monthOf(splitInstant(e.start).date)
  if (events.some((e) => { const m = monthOfEvent(e); return m.year === current.year && m.month === current.month })) return current
  const { upcoming, history } = splitHistory(events, now)
  const pick = upcoming[0] ?? history[0]
  return pick ? monthOfEvent(pick) : current
}
