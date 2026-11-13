import { mergePeriods, type Period } from '../absences/absence.rules';
import { AttendanceOutcome } from '../entities/enums';

/** What staff and the player read for one person: the outcomes recorded, counted. `injured` is a count only, never a date. */
export interface OutcomeCounts {
  present: number;
  late: number;
  absentExcused: number;
  absent: number;
  injured: number;
  /** Present or late. */
  attended: number;
  /** Attended over the events recorded where the person was available (the injured are left out), 0 to 1. `null` when none. */
  rate: number | null;
}

const rateOf = (attended: number, available: number): number | null => (available === 0 ? null : attended / available);

/** The outcomes recorded for one person across the season. Events nobody recorded never reach this list. */
export function countOutcomes(outcomes: readonly AttendanceOutcome[]): OutcomeCounts {
  const c = { present: 0, late: 0, absentExcused: 0, absent: 0, injured: 0 };
  for (const o of outcomes) {
    if (o === AttendanceOutcome.PRESENT) c.present++;
    else if (o === AttendanceOutcome.LATE) c.late++;
    else if (o === AttendanceOutcome.ABSENT_EXCUSED) c.absentExcused++;
    else if (o === AttendanceOutcome.ABSENT) c.absent++;
    else if (o === AttendanceOutcome.INJURED) c.injured++;
  }
  const attended = c.present + c.late;
  return { ...c, attended, rate: rateOf(attended, attended + c.absentExcused + c.absent) };
}

/** Team totals: the counts are summed and the rate comes from the sums, so a person with few events weighs what they played. */
export function totalsOf(rows: readonly OutcomeCounts[]): OutcomeCounts {
  const sum = (key: 'present' | 'late' | 'absentExcused' | 'absent' | 'injured') => rows.reduce((n, r) => n + r[key], 0);
  const present = sum('present');
  const late = sum('late');
  const absentExcused = sum('absentExcused');
  const absent = sum('absent');
  const attended = present + late;
  return { present, late, absentExcused, absent, injured: sum('injured'), attended, rate: rateOf(attended, attended + absentExcused + absent) };
}

const DAY_MS = 86_400_000;
const epochDay = (day: string): number => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

/**
 * Days of declared absence inside the season and up to `today` (days not lived yet do not count), each day once even where
 * periods overlap or touch. An open ended period runs to today, or to the end of the season once it is over.
 */
export function declaredDays(periods: readonly Period[], season: { startDate: string; endDate: string }, today: string): number {
  const last = today < season.endDate ? today : season.endDate;
  let days = 0;
  for (const p of mergePeriods(periods)) {
    const from = p.startDate > season.startDate ? p.startDate : season.startDate;
    const to = p.endDate === null || p.endDate > last ? last : p.endDate;
    if (to >= from) days += epochDay(to) - epochDay(from) + 1;
  }
  return days;
}

export type StatisticsView = 'full' | 'totals' | 'own' | 'none';

export interface StatisticsViewInput {
  /** Holds a staff enrollment in the season. */
  isStaff: boolean;
  isAdmin: boolean;
  /** A manager in scope or the admin. */
  readsSeason: boolean;
  isPlayer: boolean;
}

/**
 * Default: staff of the season and the admin read every player; managers in scope read the team totals only;
 * a player reads only their own figures. Anybody else is refused.
 */
export function statisticsView(i: StatisticsViewInput): StatisticsView {
  if (i.isStaff || i.isAdmin) return 'full';
  if (i.readsSeason) return 'totals';
  return i.isPlayer ? 'own' : 'none';
}
