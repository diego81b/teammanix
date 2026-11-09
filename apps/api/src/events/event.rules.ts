import { EventStatus, EventType, SeasonStatus, type HomeAway } from '../entities/enums';
import { validIsoDate } from '../structure/season.rules';

/** Pure rules for events. No DB, no Nest: the service maps each issue to an error code. */

/** The club has no timezone field yet: same default as `EventSeries`. */
export const CLUB_TIMEZONE = 'Europe/Rome';

/** Calendar day `YYYY-MM-DD` of an instant in the given timezone. */
export function localDate(instant: Date, timeZone: string = CLUB_TIMEZONE): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Season dates are local days: an event is inside if it starts and ends within them, in local time. */
export function insideSeason(
  start: Date,
  end: Date,
  season: { startDate: string; endDate: string },
  timeZone: string = CLUB_TIMEZONE,
): boolean {
  return localDate(start, timeZone) >= season.startDate && localDate(end, timeZone) <= season.endDate;
}

const INSTANT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

/** ISO datetime with `Z` or an offset, or null. Without an offset its meaning would depend on the server's timezone. */
export function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = INSTANT.exec(value);
  if (!m || !validIsoDate(m[1])) return null;
  const [hh, mm, ss, oh, om] = [m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number) as [number, number, number, number, number];
  if (hh > 23 || mm > 59 || ss > 59 || oh > 23 || om > 59) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Events exist only in the active season: a draft is for the roster, a closed one is read-only (rule 7). */
export const canPlanEvents = (status: SeasonStatus): boolean => status === SeasonStatus.ACTIVE;

export interface EventFields {
  type: EventType;
  start: Date;
  end: Date;
  hasOpponent: boolean;
  homeAway: HomeAway | null;
  competition: string | null;
}

export type EventIssue = 'period' | 'match_incomplete' | 'match_fields_not_allowed';

/** The first problem of the event as a whole, or null. A match needs opponent and home or away; the venue stays optional. */
export function eventIssue(f: EventFields): EventIssue | null {
  if (Number.isNaN(f.start.getTime()) || Number.isNaN(f.end.getTime()) || f.end.getTime() <= f.start.getTime()) return 'period';
  const hasMatchFields = f.hasOpponent || f.homeAway !== null || f.competition !== null;
  if (f.type !== EventType.MATCH) return hasMatchFields ? 'match_fields_not_allowed' : null;
  return f.hasOpponent && f.homeAway !== null ? null : 'match_incomplete';
}

/** A type change away from match must not leave match fields behind (the DB check would throw). */
export function clearMatchFields<T extends EventFields>(f: T): T {
  return f.type === EventType.MATCH ? f : { ...f, hasOpponent: false, homeAway: null, competition: null };
}

const TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  [EventStatus.SCHEDULED]: [EventStatus.CANCELLED, EventStatus.POSTPONED],
  [EventStatus.POSTPONED]: [EventStatus.SCHEDULED, EventStatus.CANCELLED],
  [EventStatus.CANCELLED]: [],
  [EventStatus.CONCLUDED]: [],
};

export const canChangeStatus = (from: EventStatus, to: EventStatus): boolean => TRANSITIONS[from].includes(to);

/** Cancelled and concluded events are history. */
export const editableEvent = (status: EventStatus): boolean => status === EventStatus.SCHEDULED || status === EventStatus.POSTPONED;

/** Names typed by hand: trimmed, inner spaces collapsed. */
export const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ');

/** Key to recognize the same venue or opponent typed twice: case and accent insensitive. */
export const nameKey = (name: string): string =>
  normalizeName(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
