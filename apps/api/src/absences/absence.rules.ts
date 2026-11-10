import { CallupResponse } from '../entities/enums';

/**
 * Pure rules of the declared absence (ANALISI rule 10). No DB, no Nest. Days are `YYYY-MM-DD` strings and are compared as
 * strings, which orders them correctly; arithmetic goes through UTC so the clock and the timezone never matter.
 */
export interface Period {
  startDate: string;
  /** null means "until further notice". */
  endDate: string | null;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in `YYYY-MM-DD`: 2026-02-30 is refused. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DAY.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type PeriodVerdict = 'ok' | 'INVALID_DATA' | 'ABSENCE_OUTSIDE_SEASON';

/** Both ends are real days, the end is not before the start, and the period stays inside the season dates. */
export function validatePeriod(p: Period, season: { startDate: string; endDate: string }): PeriodVerdict {
  if (!isDay(p.startDate) || (p.endDate !== null && !isDay(p.endDate))) return 'INVALID_DATA';
  if (p.endDate !== null && p.endDate < p.startDate) return 'INVALID_DATA';
  if (p.startDate < season.startDate || p.startDate > season.endDate) return 'ABSENCE_OUTSIDE_SEASON';
  if (p.endDate !== null && p.endDate > season.endDate) return 'ABSENCE_OUTSIDE_SEASON';
  return 'ok';
}

/** Overlapping and adjacent periods (the next one starts the day after the end) become one. Sorted, input untouched. */
export function mergePeriods(periods: readonly Period[]): Period[] {
  const merged: Period[] = [];
  for (const p of [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const last = merged[merged.length - 1];
    if (!last || (last.endDate !== null && p.startDate > nextDay(last.endDate))) {
      merged.push({ ...p });
    } else if (last.endDate !== null) {
      last.endDate = p.endDate === null || p.endDate > last.endDate ? p.endDate : last.endDate;
    }
  }
  return merged;
}

/** The day falls inside the period. */
export const covers = (p: Period, day: string): boolean => p.startDate <= day && (p.endDate === null || day <= p.endDate);

/** What blocks a person on a day: the end of the continuous absence that covers it (null: no end), or null if none. */
export function blockOn(periods: readonly Period[], day: string): { until: string | null } | null {
  const hit = mergePeriods(periods).find((p) => covers(p, day));
  return hit ? { until: hit.endDate } : null;
}

/** A call-up or availability answer of the person, with the local day of its event. */
export interface AbsenceCallup {
  eventId: string;
  day: string;
  response: CallupResponse;
  /** The event can still change: scheduled or postponed, in the active season. */
  open: boolean;
}

/**
 * The answers the one tap decline may touch: inside the period, still open, not declined already. Nothing else is
 * ever declined on behalf of the person (the risk named in the issue).
 */
export function declinable<T extends AbsenceCallup>(rows: readonly T[], p: Period): T[] {
  return rows.filter((r) => r.open && r.response !== CallupResponse.DECLINED && covers(p, r.day));
}
