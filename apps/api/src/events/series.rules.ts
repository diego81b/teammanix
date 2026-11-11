import { DateTime } from 'luxon';
import { attendanceOpensAt } from '../attendance/attendance.rules';
import { EventStatus } from '../entities/enums';
import { validIsoDate } from '../structure/season.rules';

/**
 * Pure rules for recurring events. No DB, no Nest: the service maps each issue to an error code.
 * Only weekly rules exist: the stored text is a subset of RFC 5545 (`FREQ=WEEKLY;INTERVAL=n;BYDAY=..`).
 */

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const MAX_INTERVAL_WEEKS = 52;
export const MAX_DURATION_MINUTES = 24 * 60;

export interface WeeklyRule {
  weekdays: Weekday[];
  intervalWeeks: number;
}

const isWeekday = (v: string): v is Weekday => (WEEKDAYS as readonly string[]).includes(v);

/** Days in week order, interval always written, so the same rule has one text. */
export function formatRule(r: WeeklyRule): string {
  const days = WEEKDAYS.filter((d) => r.weekdays.includes(d));
  return `FREQ=WEEKLY;INTERVAL=${r.intervalWeeks};BYDAY=${days.join(',')}`;
}

/** The rule behind a stored text, or null if it is not a weekly rule written by `formatRule`. */
export function parseRule(text: string): WeeklyRule | null {
  const m = /^FREQ=WEEKLY;INTERVAL=(\d{1,2});BYDAY=([A-Z]{2}(?:,[A-Z]{2})*)$/.exec(text);
  if (!m) return null;
  const intervalWeeks = Number(m[1]);
  const weekdays = (m[2] as string).split(',');
  if (intervalWeeks < 1 || !weekdays.every(isWeekday)) return null;
  return { weekdays: weekdays as Weekday[], intervalWeeks };
}

/** Local wall clock time to an instant. A time skipped by daylight saving moves forward, a repeated one takes the later. */
export function localInstant(date: string, time: string, timeZone: string): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone: timeZone }).toJSDate();
}

export interface SeriesSpec {
  rule: WeeklyRule;
  /** First day, local `YYYY-MM-DD`. */
  startDate: string;
  /** Last day, local, already resolved (the season end when the user gave none). */
  untilDate: string;
  /** Local start time `HH:mm`. */
  timeStart: string;
  durationMinutes: number;
  timezone: string;
}

export interface Occurrence {
  /** Local day of the slot. Identifies the session inside the series for good, even if it is moved by hand. */
  date: string;
  start: Date;
  end: Date;
}

const DAY_MS = 86_400_000;
const utcDay = (date: string): number => Date.parse(`${date}T00:00:00Z`);
const mondayOf = (ms: number): number => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS;

/**
 * Every session of the series, from the first day to the last. With an interval above 1 the weeks count from
 * the week of the start date (never from today), so a regeneration keeps the same weeks.
 */
export function occurrences(s: SeriesSpec): Occurrence[] {
  const out: Occurrence[] = [];
  const firstWeek = mondayOf(utcDay(s.startDate));
  for (let day = utcDay(s.startDate); day <= utcDay(s.untilDate); day += DAY_MS) {
    const weekday = WEEKDAYS[(new Date(day).getUTCDay() + 6) % 7] as Weekday;
    if (!s.rule.weekdays.includes(weekday)) continue;
    const weeks = (mondayOf(day) - firstWeek) / (7 * DAY_MS);
    if (weeks % s.rule.intervalWeeks !== 0) continue;
    const date = new Date(day).toISOString().slice(0, 10);
    const start = localInstant(date, s.timeStart, s.timezone);
    out.push({
      date,
      start,
      end: new Date(start.getTime() + s.durationMinutes * 60_000),
    });
  }
  return out;
}

export type SeriesIssue = 'weekdays' | 'interval' | 'time' | 'duration' | 'dates' | 'empty';

/** The first problem of the series, or null. Whether it falls inside the season is `seriesOutsideSeason`. */
export function seriesIssue(s: SeriesSpec): SeriesIssue | null {
  const days = s.rule.weekdays;
  if (days.length === 0 || new Set(days).size !== days.length || !days.every(isWeekday)) return 'weekdays';
  if (!Number.isInteger(s.rule.intervalWeeks) || s.rule.intervalWeeks < 1 || s.rule.intervalWeeks > MAX_INTERVAL_WEEKS) return 'interval';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.timeStart)) return 'time';
  if (!Number.isInteger(s.durationMinutes) || s.durationMinutes < 1 || s.durationMinutes > MAX_DURATION_MINUTES) return 'duration';
  if (!validIsoDate(s.startDate) || !validIsoDate(s.untilDate) || s.untilDate < s.startDate) return 'dates';
  return occurrences(s).length === 0 ? 'empty' : null;
}

/** Series dates are local days, like the season's. */
export function seriesOutsideSeason(startDate: string, untilDate: string, season: { startDate: string; endDate: string }): boolean {
  return startDate < season.startDate || untilDate > season.endDate;
}

export interface ExistingEvent {
  id: string;
  /** Slot the event fills in the series. */
  occurrenceDate: string;
  exception: boolean;
  status: EventStatus;
  start: Date;
}

export interface RegenerationPlan {
  /** Untouched sessions that stay and take the new times, in place (call-ups and attendance hang on the row). */
  update: { id: string; occurrence: Occurrence }[];
  create: Occurrence[];
  /** Untouched sessions whose slot is not in the rule any more. */
  orphans: string[];
}

/** Only a session nobody edited by hand, still scheduled and not yet started, follows the series. */
const follows = (e: ExistingEvent, now: Date): boolean =>
  !e.exception && e.status === EventStatus.SCHEDULED && e.start.getTime() >= now.getTime();

/**
 * What "all future ones" does. Sessions are matched by slot, not by their current date: one moved by hand or
 * cancelled still holds its slot, so nothing is created twice. Nothing in the past is created or changed.
 */
export function planRegeneration(existing: ExistingEvent[], wanted: Occurrence[], now: Date): RegenerationPlan {
  const bySlot = new Map(existing.map((e) => [e.occurrenceDate, e]));
  const plan: RegenerationPlan = { update: [], create: [], orphans: [] };
  for (const occurrence of wanted) {
    const e = bySlot.get(occurrence.date);
    if (!e) {
      if (occurrence.start.getTime() >= now.getTime()) plan.create.push(occurrence);
    } else if (follows(e, now)) plan.update.push({ id: e.id, occurrence });
  }
  const slots = new Set(wanted.map((o) => o.date));
  for (const e of existing) if (!slots.has(e.occurrenceDate) && follows(e, now)) plan.orphans.push(e.id);
  return plan;
}

export interface RemovableEvent {
  id: string;
  /** Slot the event fills in the series. */
  occurrenceDate: string;
  start: Date;
  /** Attendance is recorded on it. */
  hasAttendance: boolean;
}

export interface RemovalPlan {
  remove: string[];
  keep: string[];
  /** The series is left as it is, deleted (no session stays), or ends on that day (local `YYYY-MM-DD`). */
  series: 'untouched' | 'removed' | { endsOn: string };
}

/**
 * What "remove the future sessions" does. A session goes while its attendance check has not opened (see
 * `attendanceOpensAt`), whatever its status and even if edited by hand. The rest stays with its call-ups and attendance.
 * A session with attendance recorded stays too: it can only happen if it was moved later after the check opened, and
 * attendance is never lost. The series then ends the day before the first slot removed, so the next edit does not make
 * the sessions again; it counts from the slot, as `planRegeneration` does, and never before the first day of the series.
 */
export function planRemoval(existing: RemovableEvent[], startDate: string, now: Date): RemovalPlan {
  const remove: RemovableEvent[] = [];
  const keep: string[] = [];
  for (const e of existing) {
    if (!e.hasAttendance && attendanceOpensAt(e.start).getTime() > now.getTime()) remove.push(e);
    else keep.push(e.id);
  }
  if (remove.length === 0) return { remove: [], keep, series: 'untouched' };
  const ids = remove.map((e) => e.id);
  if (keep.length === 0) return { remove: ids, keep, series: 'removed' };
  const first = remove.map((e) => e.occurrenceDate).reduce((a, b) => (a < b ? a : b));
  const before = new Date(utcDay(first) - DAY_MS).toISOString().slice(0, 10);
  return { remove: ids, keep, series: { endsOn: before < startDate ? startDate : before } };
}
