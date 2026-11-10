import type { AbsenceOut } from '../types/api'

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

/** Every event starts chosen: the person leaves for the whole period, and can untick the ones they will attend. */
export const pickAll = (events: readonly { eventId: string }[]): string[] => events.map(e => e.eventId)

export const toggleEvent = (chosen: readonly string[], id: string): string[] =>
  chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]
