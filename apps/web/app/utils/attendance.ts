import type { AttendanceOutcome, AttendanceRow, EventStatus } from '../types/api'

/** In the order of the buttons: the usual cases first. `injured` also covers a sudden illness. */
export const OUTCOMES: AttendanceOutcome[] = ['present', 'late', 'absent_excused', 'absent', 'injured']

/** Tapping the outcome already set clears it; any other replaces it. */
export const toggleOutcome = (current: AttendanceOutcome | null, picked: AttendanceOutcome): AttendanceOutcome | null =>
  current === picked ? null : picked

/** Attendance is recorded for an event that took place: it started and was neither cancelled nor postponed. The API decides again. */
export function attendanceOpen(event: { start: string, status: EventStatus }, now: Date): boolean {
  if (event.status === 'cancelled' || event.status === 'postponed') return false
  return Date.parse(event.start) <= now.getTime()
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
