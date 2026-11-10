import { EventStatus, SuspensionForm } from '../entities/enums';
import { localDate, nameKey, normalizeName } from '../events/event.rules';
import { isDay } from '../absences/absence.rules';

/**
 * Pure rules of the suspension (ANALISI rule 13). No DB, no Nest. Nothing derived is ever stored: served and remaining
 * matches are computed from the calendar every time, so a postponed or cancelled match fixes the count by itself.
 */
export const MAX_MATCHES = 99;
export const MAX_COMPETITIONS = 20;
export const MAX_COMPETITION_LENGTH = 150;

export interface SuspensionData {
  form: SuspensionForm;
  /** Local day. For the matches form, the first day a match can count (the origin day when born from a match). */
  startDate: string;
  /** Matches form only. */
  matchCount: number | null;
  /** Period form only. */
  endDate: string | null;
  /** Matches form only. Empty means every competition. */
  competitions: readonly string[];
  /** Start of the match the suspension was born from: the count then begins from the next one. */
  originStart: Date | null;
}

export interface MatchInfo {
  id: string;
  start: Date;
  status: EventStatus;
  competition: string | null;
}

export type SuspensionVerdict = 'ok' | 'INVALID_DATA' | 'SUSPENSION_OUTSIDE_SEASON';

/** Shape of the two forms, and dates inside the season. Competitions are not checked against existing names. */
export function validateSuspension(s: SuspensionData, season: { startDate: string; endDate: string }): SuspensionVerdict {
  if (!isDay(s.startDate) || (s.endDate !== null && !isDay(s.endDate))) return 'INVALID_DATA';
  if (s.competitions.length > MAX_COMPETITIONS || s.competitions.some((c) => c.length > MAX_COMPETITION_LENGTH)) return 'INVALID_DATA';

  if (s.form === SuspensionForm.MATCHES) {
    if (s.matchCount === null || !Number.isInteger(s.matchCount) || s.matchCount < 1 || s.matchCount > MAX_MATCHES) return 'INVALID_DATA';
    if (s.endDate !== null) return 'INVALID_DATA';
  } else {
    if (s.endDate === null || s.endDate < s.startDate) return 'INVALID_DATA';
    if (s.matchCount !== null || s.competitions.length > 0) return 'INVALID_DATA';
  }

  if (s.startDate < season.startDate || s.startDate > season.endDate) return 'SUSPENSION_OUTSIDE_SEASON';
  if (s.endDate !== null && s.endDate > season.endDate) return 'SUSPENSION_OUTSIDE_SEASON';
  return 'ok';
}

/** Trimmed, single spaced, without empty names and without repeats (case and accents ignored). The first spelling stays. */
export function normalizeCompetitions(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export interface CoveredMatch {
  eventId: string;
  start: Date;
  /** Position among the matches the suspension covers, from 1. */
  number: number;
  /** Matches the suspension covers now. */
  of: number;
  /** The match is played: its date is past. */
  served: boolean;
}

export interface Coverage {
  covered: CoveredMatch[];
  served: number;
  /** Matches still to serve: the count minus the served ones for the matches form; the covered ones ahead for a period. */
  remaining: number;
  completed: boolean;
}

/** Matches that can count: cancelled and postponed never do. Oldest first. */
const countable = (matches: readonly MatchInfo[]): MatchInfo[] =>
  matches.filter((m) => m.status !== EventStatus.CANCELLED && m.status !== EventStatus.POSTPONED).sort((a, b) => a.start.getTime() - b.start.getTime());

function inCompetitions(m: MatchInfo, competitions: readonly string[]): boolean {
  if (competitions.length === 0) return true;
  if (m.competition === null) return false;
  const key = nameKey(m.competition);
  return competitions.some((c) => nameKey(c) === key);
}

/** The matches a suspension covers, with their position and whether they are served, computed against `now`. */
export function coverage(s: SuspensionData, matches: readonly MatchInfo[], now: Date): Coverage {
  const candidates = countable(matches);
  const chosen =
    s.form === SuspensionForm.PERIOD
      ? candidates.filter((m) => {
          const day = localDate(m.start);
          return day >= s.startDate && day <= (s.endDate as string);
        })
      : candidates
          .filter((m) => (s.originStart ? m.start.getTime() > s.originStart.getTime() : localDate(m.start) >= s.startDate))
          .filter((m) => inCompetitions(m, s.competitions))
          .slice(0, s.matchCount as number);

  const covered = chosen.map((m, i) => ({ eventId: m.id, start: m.start, number: i + 1, of: chosen.length, served: m.start.getTime() < now.getTime() }));
  const served = covered.filter((m) => m.served).length;

  if (s.form === SuspensionForm.PERIOD) {
    const over = localDate(now) > (s.endDate as string);
    return { covered, served, remaining: covered.length - served, completed: over };
  }
  const total = s.matchCount as number;
  return { covered, served, remaining: total - served, completed: served >= total };
}

export interface Block {
  /** Position of the event among the matches the suspension covers. */
  match: number;
  /** The number of matches in the suspension: its count, or the matches in the period. */
  total: number;
  /** Local day the suspension ends (period form), null for the matches form. */
  until: string | null;
}

/** Why a person cannot play this match, or null. With several suspensions the first that covers it answers. */
export function blockFor(suspensions: readonly SuspensionData[], matches: readonly MatchInfo[], eventId: string, now: Date): Block | null {
  for (const s of suspensions) {
    const c = coverage(s, matches, now);
    const hit = c.covered.find((m) => m.eventId === eventId);
    if (hit) {
      return { match: hit.number, total: s.form === SuspensionForm.MATCHES ? (s.matchCount as number) : hit.of, until: s.form === SuspensionForm.PERIOD ? s.endDate : null };
    }
  }
  return null;
}

/**
 * Matches left to serve in another season: the count minus the matches this season already covers, whether played or still
 * ahead (those stay in this season and are not carried twice). A period never carries over.
 */
export function residue(s: SuspensionData, matches: readonly MatchInfo[], now: Date): number {
  if (s.form !== SuspensionForm.MATCHES) return 0;
  return Math.max(0, (s.matchCount as number) - coverage(s, matches, now).covered.length);
}
