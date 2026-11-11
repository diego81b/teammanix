import type { AttendanceOutcome, AttendanceRow, EventStatus } from '../types/api'

/** In the order of the buttons: the usual cases first. `injured` also covers a sudden illness. */
export const OUTCOMES: AttendanceOutcome[] = ['present', 'late', 'absent_excused', 'absent', 'injured']

/** Tapping the outcome already set clears it; any other replaces it. */
export const toggleOutcome = (current: AttendanceOutcome | null, picked: AttendanceOutcome): AttendanceOutcome | null =>
  current === picked ? null : picked

/**
 * How long before the start the attendance check opens (a training at 20:00 opens at 19:30), for every event type.
 * The API keeps the same number in `src/attendance/attendance.rules.ts`: change both together.
 */
export const ATTENDANCE_OPENS_MINUTES_BEFORE = 30

/** Exact minutes on the instant, so a daylight saving change inside the window does not move it. */
export const attendanceOpensAt = (start: string): Date => new Date(Date.parse(start) - ATTENDANCE_OPENS_MINUTES_BEFORE * 60_000)

const neverOpens = (status: EventStatus): boolean => status === 'cancelled' || status === 'postponed'

/** The check is open from its opening time, with no upper limit, unless the event was cancelled or postponed. The API decides again. */
export function attendanceOpen(event: { start: string, status: EventStatus }, now: Date): boolean {
  if (neverOpens(event.status)) return false
  return attendanceOpensAt(event.start).getTime() <= now.getTime()
}

/** What the page says to staff before the check opens, or null when it is open or will never open. */
export function attendanceNotice(event: { start: string, status: EventStatus }, now: Date): { opensAt: Date } | null {
  if (neverOpens(event.status) || attendanceOpen(event, now)) return null
  return { opensAt: attendanceOpensAt(event.start) }
}

/** The attendance rate as a whole percentage, or null when nobody available was recorded (the injured are left out). */
export const percent = (rate: number | null): number | null => (rate === null ? null : Math.round(rate * 100))

/** A disabled person has no name for most readers: the row reads "Disabled person" (rule 12). */
export function rowName(row: Pick<AttendanceRow, 'name' | 'surname' | 'disabled'>, t: (key: string) => string): string {
  const name = [row.name, row.surname].filter(Boolean).join(' ')
  return name || (row.disabled ? t('attendance.disabledPerson') : '')
}

export function groupRows(rows: AttendanceRow[]): { staff: AttendanceRow[], players: AttendanceRow[] } {
  return { staff: rows.filter(r => r.type === 'staff'), players: rows.filter(r => r.type !== 'staff') }
}
