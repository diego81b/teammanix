import type { AbsenceOut, ExpectedPeriod, MyEnrollmentAbsences, SeasonAbsences } from '../types/api'

export interface AbsenceForm {
  startDate: string
  endDate: string
  untilFurtherNotice: boolean
}

export type PeriodError = 'startRequired' | 'endRequired' | 'endBeforeStart' | 'outsideSeason'

/**
 * What stops the form before it is sent. The API checks again and stays the authority. Days are `YYYY-MM-DD`, so they
 * compare as strings. An end typed before switching to "until further notice" is ignored.
 */
export function periodError(f: AbsenceForm, season: { seasonStart: string, seasonEnd: string }): PeriodError | null {
  if (!f.startDate) return 'startRequired'
  if (!f.untilFurtherNotice && !f.endDate) return 'endRequired'
  if (!f.untilFurtherNotice && f.endDate < f.startDate) return 'endBeforeStart'
  if (f.startDate < season.seasonStart || f.startDate > season.seasonEnd) return 'outsideSeason'
  if (!f.untilFurtherNotice && f.endDate > season.seasonEnd) return 'outsideSeason'
  return null
}

/** The body for the API: no end means "until further notice". */
export const formPayload = (f: AbsenceForm): { startDate: string, endDate: string | null } => ({
  startDate: f.startDate,
  endDate: f.untilFurtherNotice ? null : f.endDate,
})

/** Over when the end day is before today. An absence with no end is never over. */
export const isPast = (a: Pick<AbsenceOut, 'endDate'>, today: string): boolean => a.endDate !== null && a.endDate < today

/** Current and upcoming first by start date, then the past, most recent first. */
export function splitAbsences<T extends Pick<AbsenceOut, 'startDate' | 'endDate'>>(list: readonly T[], today: string): { current: T[], past: T[] } {
  const byStart = (a: T, b: T) => a.startDate.localeCompare(b.startDate)
  return {
    current: list.filter(a => !isPast(a, today)).sort(byStart),
    past: list.filter(a => isPast(a, today)).sort((a, b) => byStart(b, a)),
  }
}

export interface FreeForm {
  startDate: string
  endDate: string
  /** Free from the first day onward: there is no last day. */
  onward: boolean
}

export type FreeError = 'startRequired' | 'endRequired' | 'endBeforeStart' | 'inPast'

/**
 * What stops the "free days" form before it is sent. Only days from today included can be freed: the past never changes.
 * The API checks again and stays the authority. An end typed before switching to "onward" is ignored.
 */
export function freeError(f: FreeForm, today: string): FreeError | null {
  if (!f.startDate) return 'startRequired'
  if (!f.onward && !f.endDate) return 'endRequired'
  if (!f.onward && f.endDate < f.startDate) return 'endBeforeStart'
  if (f.startDate < today) return 'inPast'
  return null
}

/** The body for the API: no end means "from the first day onward". */
export const freePayload = (f: FreeForm): { startDate: string, endDate: string | null } => ({
  startDate: f.startDate,
  endDate: f.onward ? null : f.endDate,
})

type DayPeriod = Pick<AbsenceOut, 'startDate' | 'endDate'>

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}

/**
 * The absences as they will read once the days are freed, to show the result before the person confirms. It follows the
 * rule the API applies (and the API decides): every period the range touches is shortened, split in two (the second part
 * keeps the end, open ended stays open ended) or removed. `changed` is false when no declared day is in the range.
 */
export function freedPeriods(periods: readonly DayPeriod[], f: FreeForm): { after: DayPeriod[], changed: boolean } {
  const from = f.startDate
  const to = f.onward ? null : f.endDate
  const after: DayPeriod[] = []
  let changed = false
  for (const p of periods) {
    const touches = (to === null || p.startDate <= to) && (p.endDate === null || p.endDate >= from)
    if (!touches) {
      after.push({ startDate: p.startDate, endDate: p.endDate })
      continue
    }
    changed = true
    if (p.startDate < from) after.push({ startDate: p.startDate, endDate: shiftDay(from, -1) })
    if (to !== null && (p.endDate === null || p.endDate > to)) after.push({ startDate: shiftDay(to, 1), endDate: p.endDate })
  }
  return { after: after.sort((a, b) => a.startDate.localeCompare(b.startDate)), changed }
}

/** Freeing days makes sense only while some absence still has days from today on. */
export const canFree = (list: readonly Pick<AbsenceOut, 'endDate'>[], today: string): boolean => list.some(a => !isPast(a, today))

/** Every event starts chosen: the person leaves for the whole period, and can untick the ones they will attend. */
export const pickAll = (events: readonly { eventId: string }[]): string[] => events.map(e => e.eventId)

export const toggleEvent = (chosen: readonly string[], id: string): string[] =>
  chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]

/**
 * The team screen: people with a current or future absence first (only those periods), soonest start first; people with
 * only past ones go to a folded list, the most recent end first. A person with both is listed once, among the current.
 */
export function splitTeamAbsences(rows: readonly SeasonAbsences[], today: string): { current: SeasonAbsences[], past: SeasonAbsences[] } {
  const current: SeasonAbsences[] = []
  const past: SeasonAbsences[] = []
  for (const r of rows) {
    const split = splitAbsences(r.absences, today)
    if (split.current.length) current.push({ ...r, absences: split.current })
    else if (split.past.length) past.push({ ...r, absences: split.past })
  }
  const first = (r: SeasonAbsences) => r.absences[0]?.startDate ?? ''
  const lastEnd = (r: SeasonAbsences) => r.absences[0]?.endDate ?? ''
  return {
    current: current.sort((a, b) => first(a).localeCompare(first(b))),
    past: past.sort((a, b) => lastEnd(b).localeCompare(lastEnd(a))),
  }
}

/**
 * The player's own injury state (#21), the same in every team: confirmed injured, or expected out with the dates staff
 * recorded, or nothing. Staff enrollments never carry it.
 */
export function ownInjury(rows: readonly Pick<MyEnrollmentAbsences, 'type' | 'status' | 'expectedInjury'>[]): { kind: 'injured' } | { kind: 'expected', period: ExpectedPeriod } | null {
  const players = rows.filter(r => r.type === 'player')
  if (players.some(r => r.status === 'injured')) return { kind: 'injured' }
  const period = players.find(r => r.expectedInjury)?.expectedInjury
  return period ? { kind: 'expected', period } : null
}
