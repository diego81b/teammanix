import { AttendanceOutcome, EventStatus, SeasonStatus } from '../entities/enums';

export type RecordVerdict = 'ok' | 'SEASON_CLOSED' | 'ATTENDANCE_NOT_OPEN' | 'EVENT_NOT_RECORDABLE';

/**
 * How long before the start staff can open the attendance check (a training at 20:00 opens at 19:30). One value for every
 * event type. The web app keeps the same number in `app/utils/attendance.ts`: change both together.
 */
export const ATTENDANCE_OPENS_MINUTES_BEFORE = 30;

/** Exact minutes on the instant, so a daylight saving change inside the window does not move it. */
export function attendanceOpensAt(start: Date): Date {
  return new Date(start.getTime() - ATTENDANCE_OPENS_MINUTES_BEFORE * 60_000);
}

/**
 * Attendance is written from the opening of the check and for an event that was neither cancelled nor postponed. There is
 * no upper limit: corrections stay open until the season closes, which makes it read only (rule 7). Every change is audited.
 */
export function recordable(event: { start: Date; status: EventStatus }, season: SeasonStatus, now: Date): RecordVerdict {
  if (season === SeasonStatus.CLOSED) return 'SEASON_CLOSED';
  if (event.status === EventStatus.CANCELLED || event.status === EventStatus.POSTPONED) return 'EVENT_NOT_RECORDABLE';
  return attendanceOpensAt(event.start).getTime() <= now.getTime() ? 'ok' : 'ATTENDANCE_NOT_OPEN';
}

export type AttendanceView = 'manage' | 'read' | 'stats' | 'player' | 'none';

export interface ViewInput {
  /** Holds the `attendances.record` policy in the scope of the event. */
  canRecord: boolean;
  isStaff: boolean;
  isPlayer: boolean;
  /** A manager or an admin with read access to the season (not a recorder). */
  readsSeason: boolean;
}

/** ANALISI section 6: staff manage, managers see statistics, players see their own result and the staff present. */
export function viewOf(i: ViewInput): AttendanceView {
  if (i.canRecord) return 'manage';
  if (i.isStaff) return 'read';
  if (i.readsSeason) return 'stats';
  return i.isPlayer ? 'player' : 'none';
}

export interface Summary {
  present: number;
  late: number;
  absentExcused: number;
  absent: number;
  /** Not available because of an injury or an illness: a count only, never a name in the totals. */
  injured: number;
  notRecorded: number;
  total: number;
  /** Present or late. */
  attended: number;
  /** Attended over the people recorded who were available (the injured are left out), 0 to 1. `null` when nobody is left. */
  rate: number | null;
}

/** One outcome per person of the event, `null` when nothing was recorded for them. */
export function summarize(outcomes: readonly (AttendanceOutcome | null)[]): Summary {
  const s: Summary = { present: 0, late: 0, absentExcused: 0, absent: 0, injured: 0, notRecorded: 0, total: outcomes.length, attended: 0, rate: null };
  for (const o of outcomes) {
    if (o === AttendanceOutcome.PRESENT) s.present++;
    else if (o === AttendanceOutcome.LATE) s.late++;
    else if (o === AttendanceOutcome.ABSENT_EXCUSED) s.absentExcused++;
    else if (o === AttendanceOutcome.ABSENT) s.absent++;
    else if (o === AttendanceOutcome.INJURED) s.injured++;
    else s.notRecorded++;
  }
  s.attended = s.present + s.late;
  const available = s.total - s.notRecorded - s.injured;
  s.rate = available === 0 ? null : s.attended / available;
  return s;
}

/** A disabled person keeps the row for the totals but loses the name for everybody except the admin (rule 12). */
export function disabledMask<T extends { name: string | null; surname: string | null; disabled: boolean }>(row: T, isAdmin: boolean): T {
  return row.disabled && !isAdmin ? { ...row, name: null, surname: null } : row;
}
