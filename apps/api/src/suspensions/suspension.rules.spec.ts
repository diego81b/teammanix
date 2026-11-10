import { EventStatus, SuspensionForm } from '../entities/enums';
import {
  blockFor,
  coverage,
  normalizeCompetitions,
  residue,
  validateSuspension,
  type MatchInfo,
  type SuspensionData,
} from './suspension.rules';

const season = { startDate: '2026-09-01', endDate: '2027-06-30' };

const match = (id: string, start: string, extra: Partial<MatchInfo> = {}): MatchInfo => ({
  id,
  start: new Date(start),
  status: EventStatus.SCHEDULED,
  competition: 'League',
  ...extra,
});

const matches = (count: number, extra: Partial<MatchInfo> = {}): MatchInfo[] =>
  Array.from({ length: count }, (_, i) => match(`m${i + 1}`, new Date(Date.UTC(2026, 10, 10 + i * 7, 15)).toISOString(), extra));

const byMatches = (extra: Partial<SuspensionData> = {}): SuspensionData => ({
  form: SuspensionForm.MATCHES,
  startDate: '2026-11-01',
  matchCount: 2,
  endDate: null,
  competitions: [],
  originStart: null,
  ...extra,
});

const byPeriod = (extra: Partial<SuspensionData> = {}): SuspensionData => ({
  form: SuspensionForm.PERIOD,
  startDate: '2026-11-10',
  matchCount: null,
  endDate: '2026-11-20',
  competitions: [],
  originStart: null,
  ...extra,
});

const now = new Date('2026-11-12T12:00:00Z');

describe('validateSuspension', () => {
  it('accepts a number of matches inside the season', () => {
    expect(validateSuspension(byMatches(), season)).toBe('ok');
  });

  it('accepts a period inside the season, even of a single day', () => {
    expect(validateSuspension(byPeriod(), season)).toBe('ok');
    expect(validateSuspension(byPeriod({ endDate: '2026-11-10' }), season)).toBe('ok');
  });

  it('refuses a number of matches below one or not whole', () => {
    expect(validateSuspension(byMatches({ matchCount: 0 }), season)).toBe('INVALID_DATA');
    expect(validateSuspension(byMatches({ matchCount: 1.5 }), season)).toBe('INVALID_DATA');
    expect(validateSuspension(byMatches({ matchCount: null }), season)).toBe('INVALID_DATA');
  });

  it('refuses a number of matches above the cap', () => {
    expect(validateSuspension(byMatches({ matchCount: 100 }), season)).toBe('INVALID_DATA');
  });

  it('matches form has no end date', () => {
    expect(validateSuspension(byMatches({ endDate: '2026-11-20' }), season)).toBe('INVALID_DATA');
  });

  it('period form needs an end date, not before the start, and has no count and no competitions', () => {
    expect(validateSuspension(byPeriod({ endDate: null }), season)).toBe('INVALID_DATA');
    expect(validateSuspension(byPeriod({ endDate: '2026-11-09' }), season)).toBe('INVALID_DATA');
    expect(validateSuspension(byPeriod({ matchCount: 2 }), season)).toBe('INVALID_DATA');
    expect(validateSuspension(byPeriod({ competitions: ['League'] }), season)).toBe('INVALID_DATA');
  });

  it('refuses dates that are not real calendar days', () => {
    expect(validateSuspension(byMatches({ startDate: '2026-02-30' }), season)).toBe('INVALID_DATA');
    expect(validateSuspension(byPeriod({ endDate: '2026-13-01' }), season)).toBe('INVALID_DATA');
  });

  it('refuses a start or an end outside the season', () => {
    expect(validateSuspension(byMatches({ startDate: '2026-08-31' }), season)).toBe('SUSPENSION_OUTSIDE_SEASON');
    expect(validateSuspension(byMatches({ startDate: '2027-07-01' }), season)).toBe('SUSPENSION_OUTSIDE_SEASON');
    expect(validateSuspension(byPeriod({ endDate: '2027-07-01' }), season)).toBe('SUSPENSION_OUTSIDE_SEASON');
  });

  it('refuses too many or too long competition names', () => {
    expect(validateSuspension(byMatches({ competitions: Array.from({ length: 21 }, (_, i) => `C${i}`) }), season)).toBe('INVALID_DATA');
    expect(validateSuspension(byMatches({ competitions: ['x'.repeat(151)] }), season)).toBe('INVALID_DATA');
  });
});

describe('normalizeCompetitions', () => {
  it('trims, collapses spaces and drops empty names and repeats ignoring case and accents', () => {
    expect(normalizeCompetitions(['  Coppa   Italia ', 'coppa italia', '', 'Campionato', 'campionatò'])).toEqual(['Coppa Italia', 'Campionato']);
  });
});

describe('coverage, matches form', () => {
  it('covers the first N matches from the start date, in calendar order', () => {
    const c = coverage(byMatches(), matches(4).reverse(), now);
    expect(c.covered.map((m) => [m.eventId, m.number, m.of])).toEqual([
      ['m1', 1, 2],
      ['m2', 2, 2],
    ]);
  });

  it('skips matches before the start date', () => {
    const c = coverage(byMatches({ startDate: '2026-11-15' }), matches(4), now);
    expect(c.covered.map((m) => m.eventId)).toEqual(['m2', 'm3']);
  });

  it('a match is served when its date is past, otherwise it is ahead', () => {
    const c = coverage(byMatches(), matches(3), now);
    expect(c.covered.map((m) => m.served)).toEqual([true, false]);
    expect(c.served).toBe(1);
    expect(c.remaining).toBe(1);
    expect(c.completed).toBe(false);
  });

  it('is completed when the last covered match is played, and the player is free again for the next', () => {
    const later = new Date('2026-11-18T12:00:00Z');
    const c = coverage(byMatches(), matches(3), later);
    expect(c.served).toBe(2);
    expect(c.remaining).toBe(0);
    expect(c.completed).toBe(true);
    expect(c.covered.map((m) => m.eventId)).toEqual(['m1', 'm2']);
  });

  it('a postponed match does not count: the next one is covered instead', () => {
    const list = matches(4);
    list[0] = { ...list[0]!, status: EventStatus.POSTPONED };
    const c = coverage(byMatches(), list, now);
    expect(c.covered.map((m) => m.eventId)).toEqual(['m2', 'm3']);
    expect(c.served).toBe(0);
  });

  it('a cancelled match does not count either', () => {
    const list = matches(4);
    list[1] = { ...list[1]!, status: EventStatus.CANCELLED };
    expect(coverage(byMatches(), list, now).covered.map((m) => m.eventId)).toEqual(['m1', 'm3']);
  });

  it('a postponed match rescheduled later counts again, in its new place', () => {
    const list = matches(3);
    list[0] = { ...list[0]!, start: new Date('2026-12-30T15:00:00Z') };
    expect(coverage(byMatches(), list, now).covered.map((m) => m.eventId)).toEqual(['m2', 'm3']);
  });

  it('with fewer matches than the count, covers what exists and the rest stays pending', () => {
    const c = coverage(byMatches({ matchCount: 5 }), matches(2), now);
    expect(c.covered).toHaveLength(2);
    expect(c.remaining).toBe(4);
    expect(c.completed).toBe(false);
  });

  it('with no competition chosen every match counts', () => {
    const list = [match('a', '2026-11-10T15:00:00Z', { competition: 'League' }), match('b', '2026-11-17T15:00:00Z', { competition: 'Cup' })];
    expect(coverage(byMatches(), list, now).covered).toHaveLength(2);
  });

  it('with competitions chosen only their matches count, ignoring case, accents and spaces', () => {
    const list = [
      match('a', '2026-11-10T15:00:00Z', { competition: 'League' }),
      match('b', '2026-11-17T15:00:00Z', { competition: 'Coppa  Italia' }),
      match('c', '2026-11-24T15:00:00Z', { competition: 'coppa italià' }),
      match('d', '2026-12-01T15:00:00Z', { competition: null }),
    ];
    const c = coverage(byMatches({ competitions: ['Coppa Italia'] }), list, now);
    expect(c.covered.map((m) => [m.eventId, m.number])).toEqual([
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('a match with no competition is never covered when competitions are chosen', () => {
    const list = [match('a', '2026-11-10T15:00:00Z', { competition: null })];
    expect(coverage(byMatches({ competitions: ['League'] }), list, now).covered).toEqual([]);
  });

  it('born from a match, it starts from the next one, not from the origin itself', () => {
    const origin = matches(4)[1]!;
    const c = coverage(byMatches({ startDate: '2026-11-17', originStart: origin.start }), matches(4), now);
    expect(c.covered.map((m) => m.eventId)).toEqual(['m3', 'm4']);
  });

  it('born from a match, another match on the same local day later in the evening still counts as the next', () => {
    const list = [match('first', '2026-11-17T09:00:00Z'), match('second', '2026-11-17T17:00:00Z'), match('third', '2026-11-24T09:00:00Z')];
    const c = coverage(byMatches({ matchCount: 1, startDate: '2026-11-17', originStart: list[0]!.start }), list, now);
    expect(c.covered.map((m) => m.eventId)).toEqual(['second']);
  });

  it('the start date counts the whole local day, with the Italian timezone', () => {
    // 23:30 UTC on the 9th is already the 10th in Rome.
    const list = [match('late', '2026-11-09T23:30:00Z')];
    expect(coverage(byMatches({ startDate: '2026-11-10' }), list, now).covered).toHaveLength(1);
  });

  it('trainings and other events are never passed in, matches only: no match means nothing covered', () => {
    expect(coverage(byMatches(), [], now)).toMatchObject({ covered: [], served: 0, remaining: 2, completed: false });
  });
});

describe('coverage, period form', () => {
  it('covers every match of the period, any competition, both ends included', () => {
    const list = [
      match('before', '2026-11-09T15:00:00Z'),
      match('first', '2026-11-10T15:00:00Z', { competition: 'Cup' }),
      match('middle', '2026-11-15T15:00:00Z', { competition: null }),
      match('last', '2026-11-20T15:00:00Z'),
      match('after', '2026-11-21T15:00:00Z'),
    ];
    const c = coverage(byPeriod(), list, now);
    expect(c.covered.map((m) => [m.eventId, m.number, m.of])).toEqual([
      ['first', 1, 3],
      ['middle', 2, 3],
      ['last', 3, 3],
    ]);
  });

  it('postponed and cancelled matches of the period do not count', () => {
    const list = [match('a', '2026-11-12T15:00:00Z', { status: EventStatus.POSTPONED }), match('b', '2026-11-14T15:00:00Z', { status: EventStatus.CANCELLED })];
    expect(coverage(byPeriod(), list, now).covered).toEqual([]);
  });

  it('is completed once the period is over, not before', () => {
    expect(coverage(byPeriod(), [], new Date('2026-11-19T12:00:00Z')).completed).toBe(false);
    expect(coverage(byPeriod(), [], new Date('2026-11-21T12:00:00Z')).completed).toBe(true);
  });
});

describe('blockFor', () => {
  it('names the match and the total for the covered event', () => {
    const list = matches(3);
    expect(blockFor([byMatches()], list, 'm2', now)).toEqual({ match: 2, total: 2, until: null });
  });

  it('is null for a match that is not covered', () => {
    expect(blockFor([byMatches()], matches(3), 'm3', now)).toBeNull();
  });

  it('a period gives the day it ends as `until`', () => {
    expect(blockFor([byPeriod()], [match('a', '2026-11-15T15:00:00Z')], 'a', now)).toEqual({ match: 1, total: 1, until: '2026-11-20' });
  });

  it('the first suspension that covers the event answers when several do', () => {
    const list = matches(2);
    expect(blockFor([byMatches({ matchCount: 1 }), byPeriod({ startDate: '2026-11-01', endDate: '2026-12-31' })], list, 'm1', now)).toMatchObject({ match: 1, total: 1 });
  });

  it('is null with no suspension', () => {
    expect(blockFor([], matches(2), 'm1', now)).toBeNull();
  });
});

describe('residue', () => {
  it('is the count minus the matches the season covers: what is left to serve in the next season', () => {
    expect(residue(byMatches({ matchCount: 3 }), matches(1), now)).toBe(2);
  });

  it('is zero when the season covers all of them', () => {
    expect(residue(byMatches({ matchCount: 2 }), matches(5), now)).toBe(0);
  });

  it('does not depend on the matches already played: future covered matches stay with the source season', () => {
    const past = new Date('2027-01-01T00:00:00Z');
    expect(residue(byMatches({ matchCount: 3 }), matches(3), past)).toBe(0);
    expect(residue(byMatches({ matchCount: 3 }), matches(3), new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });

  it('the period form leaves nothing to carry', () => {
    expect(residue(byPeriod(), [], now)).toBe(0);
  });
});
