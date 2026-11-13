import { isDay } from '../absences/absence.rules';

/**
 * Pure rules of the expected injury (#21). No DB, no Nest. Staff expect a player to be out from `startDate`; `returnDate`
 * is the first day the player is available again, so the period covers `startDate <= day < returnDate`. Dates only: no
 * cause, no note (health data, art. 9). A date never blocks: only the confirmed injured state does.
 */
export interface ExpectedPeriod {
  startDate: string;
  returnDate: string;
}

/** Both ends are real days and the return comes after the start. */
export function validateExpected(p: ExpectedPeriod): 'ok' | 'INVALID_DATA' {
  if (!isDay(p.startDate) || !isDay(p.returnDate)) return 'INVALID_DATA';
  return p.returnDate > p.startDate ? 'ok' : 'INVALID_DATA';
}

export const coversDay = (p: ExpectedPeriod, day: string): boolean => p.startDate <= day && day < p.returnDate;

/** The expected injury on a day, from the periods of every team of the person: the latest return wins. */
export function expectedOn(periods: readonly ExpectedPeriod[], day: string): { until: string } | null {
  const until = periods.filter((p) => coversDay(p, day)).reduce<string | null>((max, p) => (max === null || p.returnDate > max ? p.returnDate : max), null);
  return until ? { until } : null;
}

/** The period not over yet on `today` (the return is still ahead), from every team of the person: the latest return wins. Dates only. */
export function currentExpected(periods: readonly ExpectedPeriod[], today: string): ExpectedPeriod | null {
  return periods
    .filter((p) => p.returnDate > today)
    .reduce<ExpectedPeriod | null>((best, p) => (best === null || p.returnDate > best.returnDate ? { startDate: p.startDate, returnDate: p.returnDate } : best), null);
}
