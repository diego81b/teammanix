import type { EventDto, SeasonSuspension } from '../types/api'
import type { MonthCell } from './calendar'
import { splitInstant } from './event'

/** A period suspension drawn over the days of one week. `col` is the first column (1 is Monday), `from` and `to` the whole period. */
export interface WeekBar { id: string, name: string, col: number, span: number, from: string, to: string }

/** A covered match of a suspension by matches, on its day. */
export interface WeekInitials { id: string, name: string, initials: string, col: number, day: string, served: boolean }

export const initialsOf = (name: string, surname: string | null): string =>
  [name, surname].filter(Boolean).map(w => (w as string).trim().charAt(0).toUpperCase()).join('')

const fullName = (s: Pick<SeasonSuspension, 'name' | 'surname'>) => [s.name, s.surname].filter(Boolean).join(' ')

/** Name first, then id: marks of the same day never swap places between renders. */
const byPerson = (locale: string) => (a: { name: string, id: string }, b: { name: string, id: string }) =>
  a.name.localeCompare(b.name, locale) || a.id.localeCompare(b.id)

/**
 * What a week of the month grid draws. A period is a bar over the days it spans in that week, one bar per week it crosses.
 * A suspension by matches marks the days of its covered matches with the initials of the person. The API already leaves out
 * postponed and cancelled matches from `covered`, so nothing is checked again here.
 */
export function weekMarks(week: readonly MonthCell[], list: readonly SeasonSuspension[], locale: string): { bars: WeekBar[], initials: WeekInitials[] } {
  const first = week[0]!.day
  const last = week[week.length - 1]!.day
  const col = (day: string) => week.findIndex(c => c.day === day) + 1
  const bars: WeekBar[] = []
  const initials: WeekInitials[] = []
  for (const s of list) {
    if (s.form === 'period') {
      const end = s.endDate as string
      const from = s.startDate > first ? s.startDate : first
      const to = end < last ? end : last
      if (from > to) continue
      bars.push({ id: s.id, name: fullName(s), col: col(from), span: col(to) - col(from) + 1, from: s.startDate, to: end })
      continue
    }
    for (const c of s.covered) {
      const day = splitInstant(c.start).date
      if (day < first || day > last) continue
      initials.push({ id: s.id, name: fullName(s), initials: initialsOf(s.name, s.surname), col: col(day), day, served: c.served })
    }
  }
  const order = byPerson(locale)
  return { bars: bars.sort(order), initials: initials.sort((a, b) => order(a, b) || a.day.localeCompare(b.day)) }
}

/** Local days with a match still on the calendar (played or not). Cancelled and postponed ones are not match days. */
export function matchDays(events: readonly Pick<EventDto, 'start' | 'type' | 'status'>[]): Set<string> {
  return new Set(events.filter(e => e.type === 'match' && (e.status === 'scheduled' || e.status === 'concluded')).map(e => splitInstant(e.start).date))
}
