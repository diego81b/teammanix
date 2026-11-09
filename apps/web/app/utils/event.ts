import type { EventDto, EventStatus, EventType, HomeAway } from '../types/api'

/** Fields of the event form: strings as the inputs give them. Date and times are local to the browser. */
export interface EventForm {
  type: EventType
  title: string
  date: string
  startTime: string
  endTime: string
  venueId: string
  note: string
  opponent: string
  homeAway: HomeAway | ''
  competition: string
}

export type EventFormIssue = 'dates_missing' | 'period' | 'match_incomplete'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local date and time to a UTC ISO instant, null if they are empty or not a real moment. */
export function toInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const [h, mi] = time.split(':').map(Number) as [number, number]
  const value = new Date(y, mo - 1, d, h, mi)
  const real = value.getFullYear() === y && value.getMonth() === mo - 1 && value.getDate() === d && value.getHours() === h
  return real ? value.toISOString() : null
}

/** UTC ISO instant to local `YYYY-MM-DD` and `HH:mm`, as the form inputs want them. */
export function splitInstant(iso: string): { date: string, time: string } {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/** Same checks the API makes on the shape, to answer before the call. The API stays the authority (and checks the season dates). */
export function eventFormIssue(f: EventForm): EventFormIssue | null {
  const start = toInstant(f.date, f.startTime)
  const end = toInstant(f.date, f.endTime)
  if (!start || !end) return 'dates_missing'
  if (new Date(end) <= new Date(start)) return 'period'
  if (f.type === 'match' && (!f.opponent.trim() || !f.homeAway)) return 'match_incomplete'
  return null
}

/** What can still be done to an event, by status (same table as the API). */
export function eventActions(status: EventStatus): { edit: boolean, cancel: boolean, postpone: boolean } {
  const open = status === 'scheduled' || status === 'postponed'
  return { edit: open, cancel: open, postpone: status === 'scheduled' }
}

/** Events in the given order, grouped by local day. */
export function groupByDay(events: readonly EventDto[]): { day: string, events: EventDto[] }[] {
  const groups: { day: string, events: EventDto[] }[] = []
  for (const e of events) {
    const day = splitInstant(e.start).date
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.events.push(e)
    else groups.push({ day, events: [e] })
  }
  return groups
}

export interface EventPayload {
  type: EventType
  start: string
  end: string
  title: string | null
  venueId: string | null
  note: string | null
  opponent?: string
  homeAway?: HomeAway
  competition?: string | null
}

const orNull = (value: string): string | null => value.trim() || null

/** Body for create and edit. Match fields go only with a match (the API refuses them on other types). Null if the dates are invalid. */
export function eventPayload(f: EventForm): EventPayload | null {
  const start = toInstant(f.date, f.startTime)
  const end = toInstant(f.date, f.endTime)
  if (!start || !end) return null
  const payload: EventPayload = { type: f.type, start, end, title: orNull(f.title), venueId: f.venueId || null, note: orNull(f.note) }
  if (f.type === 'match') {
    payload.opponent = f.opponent.trim()
    payload.homeAway = f.homeAway as HomeAway
    payload.competition = orNull(f.competition)
  }
  return payload
}

/** Form pre-filled from an existing event. */
export function formFromEvent(e: EventDto): EventForm {
  const start = splitInstant(e.start)
  return {
    type: e.type,
    title: e.title ?? '',
    date: start.date,
    startTime: start.time,
    endTime: splitInstant(e.end).time,
    venueId: e.venue?.id ?? '',
    note: e.note ?? '',
    opponent: e.opponent?.name ?? '',
    homeAway: e.homeAway ?? '',
    competition: e.competition ?? '',
  }
}

/** Empty form for a new event of the given day (default training). */
export function emptyEventForm(date = ''): EventForm {
  return { type: 'training', title: '', date, startTime: '18:00', endTime: '19:30', venueId: '', note: '', opponent: '', homeAway: '', competition: '' }
}
