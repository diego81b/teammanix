import { SeasonStatus } from '../entities/enums';

/** ISO date `YYYY-MM-DD` that really exists in the calendar (rejects 2027-02-29). */
export function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [a, m, g] = value.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
}

/** End equal to or after start, both valid dates. */
export function periodValid(start: unknown, end: unknown): boolean {
  return validIsoDate(start) && validIsoDate(end) && end >= start;
}

/** Only a draft is activated. Closing has its own path (rule 8). */
export const canActivate = (status: SeasonStatus): boolean => status === SeasonStatus.DRAFT;

/** Only an active season is closed (rule 8). A draft is edited or activated, a closed one is already archived. */
export const canClose = (status: SeasonStatus): boolean => status === SeasonStatus.ACTIVE;

/** A closed season is read-only (rule 7). */
export const editable = (status: SeasonStatus): boolean => status !== SeasonStatus.CLOSED;
