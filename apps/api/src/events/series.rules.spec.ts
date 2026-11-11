import { EventStatus } from '../entities/enums';
import {
  formatRule,
  localInstant,
  occurrences,
  parseRule,
  planRegeneration,
  planRemoval,
  seriesIssue,
  seriesOutsideSeason,
  type ExistingEvent,
  type RemovableEvent,
  type SeriesSpec,
} from './series.rules';

const spec = (over: Partial<SeriesSpec> = {}): SeriesSpec => ({
  rule: { weekdays: ['TU', 'TH'], intervalWeeks: 1 },
  startDate: '2026-10-05',
  untilDate: '2026-10-18',
  timeStart: '18:00',
  durationMinutes: 90,
  timezone: 'Europe/Rome',
  ...over,
});

describe('rule text', () => {
  it('writes weekly rules with the days in week order and always the interval', () => {
    expect(formatRule({ weekdays: ['TH', 'TU'], intervalWeeks: 1 })).toBe('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH');
    expect(formatRule({ weekdays: ['SU', 'MO'], intervalWeeks: 2 })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU');
  });

  it('reads back what it writes', () => {
    const rule = { weekdays: ['MO', 'WE', 'FR'] as const, intervalWeeks: 3 };
    expect(parseRule(formatRule({ ...rule, weekdays: [...rule.weekdays] }))).toEqual({ weekdays: ['MO', 'WE', 'FR'], intervalWeeks: 3 });
  });

  it('refuses anything that is not a weekly rule', () => {
    for (const bad of [
      '',
      'FREQ=DAILY;BYDAY=TU',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=WEEKLY;INTERVAL=0;BYDAY=TU',
      'FREQ=WEEKLY;INTERVAL=1',
      'garbage',
    ]) {
      expect(parseRule(bad)).toBeNull();
    }
  });
});

describe('localInstant: a local wall clock time in a timezone', () => {
  it('uses the offset in force that day', () => {
    expect(localInstant('2026-10-20', '18:00', 'Europe/Rome').toISOString()).toBe('2026-10-20T16:00:00.000Z'); // CEST, +2
    expect(localInstant('2026-11-03', '18:00', 'Europe/Rome').toISOString()).toBe('2026-11-03T17:00:00.000Z'); // CET, +1
  });

  it('a time that does not exist (spring forward) moves forward by the gap', () => {
    expect(localInstant('2027-03-28', '02:30', 'Europe/Rome').toISOString()).toBe('2027-03-28T01:30:00.000Z'); // 03:30 CEST
  });

  it('a time that happens twice (fall back) takes the later one', () => {
    expect(localInstant('2026-10-25', '02:30', 'Europe/Rome').toISOString()).toBe('2026-10-25T01:30:00.000Z'); // CET
  });
});

describe('occurrences', () => {
  it('lists every matching date of the period, both ends included', () => {
    const o = occurrences(spec());
    expect(o.map((x) => x.date)).toEqual(['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
    expect(o[0]?.start.toISOString()).toBe('2026-10-06T16:00:00.000Z');
    expect(o[0]?.end.toISOString()).toBe('2026-10-06T17:30:00.000Z');
  });

  it('a day of the first week before the start date is not an occurrence', () => {
    expect(occurrences(spec({ startDate: '2026-10-07' })).map((x) => x.date)).toEqual(['2026-10-08', '2026-10-13', '2026-10-15']);
  });

  it('the last day counts, one day later does not', () => {
    expect(occurrences(spec({ untilDate: '2026-10-08' })).map((x) => x.date)).toEqual(['2026-10-06', '2026-10-08']);
    expect(occurrences(spec({ untilDate: '2026-10-07' })).map((x) => x.date)).toEqual(['2026-10-06']);
  });

  it('every second week counts from the week of the start date', () => {
    const o = occurrences(
      spec({
        rule: { weekdays: ['TU'], intervalWeeks: 2 },
        untilDate: '2026-11-10',
      }),
    );
    expect(o.map((x) => x.date)).toEqual(['2026-10-06', '2026-10-20', '2026-11-03']);
  });

  it('keeps the same local start time across both daylight saving changes', () => {
    const o = occurrences(
      spec({
        rule: { weekdays: ['SU'], intervalWeeks: 1 },
        startDate: '2026-10-18',
        untilDate: '2027-04-04',
      }),
    );
    const local = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    expect(new Set(o.map((x) => local(x.start)))).toEqual(new Set(['18:00']));
    // The UTC instant does move: 16:00Z in summer time, 17:00Z in winter time.
    expect(o.find((x) => x.date === '2026-10-18')?.start.toISOString()).toBe('2026-10-18T16:00:00.000Z');
    expect(o.find((x) => x.date === '2026-10-25')?.start.toISOString()).toBe('2026-10-25T17:00:00.000Z');
    expect(o.find((x) => x.date === '2027-03-28')?.start.toISOString()).toBe('2027-03-28T16:00:00.000Z');
  });

  it('is empty when no day matches', () => {
    expect(
      occurrences(
        spec({
          rule: { weekdays: ['SU'], intervalWeeks: 1 },
          startDate: '2026-10-05',
          untilDate: '2026-10-10',
        }),
      ),
    ).toEqual([]);
  });
});

describe('seriesIssue', () => {
  const check = (over: Partial<SeriesSpec>) => seriesIssue(spec(over));

  it('accepts a valid series', () => {
    expect(check({})).toBeNull();
  });

  it('refuses no days, repeated days, a bad interval', () => {
    expect(check({ rule: { weekdays: [], intervalWeeks: 1 } })).toBe('weekdays');
    expect(check({ rule: { weekdays: ['TU', 'TU'], intervalWeeks: 1 } })).toBe('weekdays');
    expect(check({ rule: { weekdays: ['TU'], intervalWeeks: 0 } })).toBe('interval');
    expect(check({ rule: { weekdays: ['TU'], intervalWeeks: 53 } })).toBe('interval');
    expect(check({ rule: { weekdays: ['TU'], intervalWeeks: 1.5 } })).toBe('interval');
  });

  it('refuses a bad time or duration', () => {
    for (const timeStart of ['24:00', '7:00', '18:60', '']) expect(check({ timeStart })).toBe('time');
    expect(check({ durationMinutes: 0 })).toBe('duration');
    expect(check({ durationMinutes: 1441 })).toBe('duration');
  });

  it('refuses impossible dates and an end before the start', () => {
    expect(check({ startDate: '2026-02-30' })).toBe('dates');
    expect(check({ untilDate: '2026-10-04' })).toBe('dates');
  });

  it('refuses a series with no session at all', () => {
    expect(
      check({
        rule: { weekdays: ['SU'], intervalWeeks: 1 },
        untilDate: '2026-10-10',
      }),
    ).toBe('empty');
  });
});

describe('seriesOutsideSeason', () => {
  const season = { startDate: '2026-09-01', endDate: '2027-06-30' };
  it('both dates must be inside the season, ends included', () => {
    expect(seriesOutsideSeason('2026-09-01', '2027-06-30', season)).toBe(false);
    expect(seriesOutsideSeason('2026-08-31', '2026-10-01', season)).toBe(true);
    expect(seriesOutsideSeason('2026-10-01', '2027-07-01', season)).toBe(true);
  });
});

describe('planRegeneration', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const future = spec({ startDate: '2026-10-05', untilDate: '2026-10-31' });
  const ex = (date: string, over: Partial<ExistingEvent> = {}): ExistingEvent => ({
    id: `e-${date}`,
    occurrenceDate: date,
    exception: false,
    status: EventStatus.SCHEDULED,
    start: localInstant(date, '18:00', 'Europe/Rome'),
    ...over,
  });
  const dates = (xs: { date: string }[]) => xs.map((x) => x.date);

  it('creates the missing future sessions and updates the untouched ones in place', () => {
    const existing = [ex('2026-10-13')];
    const p = planRegeneration(existing, occurrences(future), now);
    expect(p.update.map((u) => u.id)).toEqual(['e-2026-10-13']);
    expect(dates(p.create)).toEqual(['2026-10-15', '2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29']);
    expect(p.orphans).toEqual([]);
  });

  it('never touches a session already started or in the past, and does not recreate it', () => {
    const existing = [ex('2026-10-06'), ex('2026-10-08')];
    const p = planRegeneration(existing, occurrences(future), now);
    expect(p.update).toEqual([]);
    expect(dates(p.create)).not.toContain('2026-10-06');
    expect(dates(p.create)).not.toContain('2026-10-08');
    expect(p.orphans).toEqual([]);
  });

  it('leaves a session edited by hand alone and does not create a duplicate on its slot', () => {
    const moved = ex('2026-10-13', {
      exception: true,
      start: localInstant('2026-10-14', '19:00', 'Europe/Rome'),
    });
    const p = planRegeneration([moved], occurrences(future), now);
    expect(p.update).toEqual([]);
    expect(dates(p.create)).not.toContain('2026-10-13');
  });

  it('a cancelled or postponed session keeps its slot and is left alone', () => {
    const existing = [ex('2026-10-13', { status: EventStatus.CANCELLED }), ex('2026-10-15', { status: EventStatus.POSTPONED })];
    const p = planRegeneration(existing, occurrences(future), now);
    expect(p.update).toEqual([]);
    expect(dates(p.create)).not.toContain('2026-10-13');
    expect(dates(p.create)).not.toContain('2026-10-15');
  });

  it('untouched future sessions that no longer match the rule are orphans', () => {
    const shorter = spec({ untilDate: '2026-10-16' });
    const existing = [ex('2026-10-20'), ex('2026-10-22', { exception: true }), ex('2026-10-27', { status: EventStatus.CANCELLED })];
    const p = planRegeneration(existing, occurrences(shorter), now);
    expect(p.orphans).toEqual(['e-2026-10-20']);
  });

  it('does not create a session whose time already passed today', () => {
    const today = spec({
      rule: { weekdays: ['SA'], intervalWeeks: 1 },
      startDate: '2026-10-05',
      untilDate: '2026-10-17',
    });
    const p = planRegeneration([], occurrences(today), new Date('2026-10-10T17:00:00Z')); // Saturday 10th, 19:00 local, after the 18:00 start
    expect(dates(p.create)).toEqual(['2026-10-17']);
  });
});

describe('planRemoval', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const at = (date: string, time = '18:00') => localInstant(date, time, 'Europe/Rome');
  const ex = (date: string, over: Partial<RemovableEvent> = {}): RemovableEvent => ({
    id: `e-${date}`,
    occurrenceDate: date,
    start: at(date),
    hasAttendance: false,
    ...over,
  });

  it('removes the sessions whose attendance check has not opened and keeps the ones already held', () => {
    const p = planRemoval([ex('2026-10-06'), ex('2026-10-08'), ex('2026-10-13'), ex('2026-10-15')], '2026-10-05', now);
    expect(p.remove).toEqual(['e-2026-10-13', 'e-2026-10-15']);
    expect(p.keep).toEqual(['e-2026-10-06', 'e-2026-10-08']);
  });

  it('a session today that starts later than the check window is removed', () => {
    expect(planRemoval([ex('2026-10-10')], '2026-10-05', now).remove).toEqual(['e-2026-10-10']);
  });

  it('keeps a session in progress and one whose check is open, and removes the one whose check opens a second later', () => {
    const inProgress = ex('2026-10-10', { id: 'running', start: new Date('2026-10-10T11:30:00Z') });
    const open = ex('2026-10-10', { id: 'open', start: new Date('2026-10-10T12:20:00Z') });
    const exactly = ex('2026-10-10', { id: 'exactly', start: new Date('2026-10-10T12:30:00Z') }); // the check opens at this very instant
    const later = ex('2026-10-10', { id: 'later', start: new Date('2026-10-10T12:30:01Z') });
    const p = planRemoval([inProgress, open, exactly, later], '2026-10-05', now);
    expect(p.keep).toEqual(['running', 'open', 'exactly']);
    expect(p.remove).toEqual(['later']);
  });

  it('keeps a future session that already has attendance, because attendance is never lost', () => {
    const moved = ex('2026-10-13', { hasAttendance: true });
    const p = planRemoval([moved, ex('2026-10-15')], '2026-10-05', now);
    expect(p.keep).toEqual(['e-2026-10-13']);
    expect(p.remove).toEqual(['e-2026-10-15']);
  });

  it('the series ends the day before the first removed session', () => {
    const p = planRemoval([ex('2026-10-06'), ex('2026-10-13'), ex('2026-10-15')], '2026-10-05', now);
    expect(p.series).toEqual({ endsOn: '2026-10-12' });
  });

  it('counts the day from the slot of the session, not from where it was moved', () => {
    // Slot of the 13th, moved by hand to the 20th: the slot is what the rule would create again.
    const moved = ex('2026-10-13', { start: at('2026-10-20') });
    const p = planRemoval([ex('2026-10-06'), moved, ex('2026-10-15')], '2026-10-05', now);
    expect(p.series).toEqual({ endsOn: '2026-10-12' });
    // Slot already past, session moved to the future: it is removed, and the slot of the past still ends the series there.
    const back = ex('2026-10-08', { start: at('2026-10-20') });
    expect(planRemoval([ex('2026-10-06'), back, ex('2026-10-15')], '2026-10-05', now)).toMatchObject({
      remove: ['e-2026-10-08', 'e-2026-10-15'],
      series: { endsOn: '2026-10-07' },
    });
  });

  it('counts the month and year boundary correctly', () => {
    const held = ex('2026-10-06');
    expect(planRemoval([held, ex('2026-11-01')], '2026-10-05', now).series).toEqual({ endsOn: '2026-10-31' });
    expect(planRemoval([held, ex('2027-01-01')], '2026-10-05', now).series).toEqual({ endsOn: '2026-12-31' });
  });

  it('never ends the series before its first day', () => {
    const first = ex('2026-10-13', { id: 'first' });
    const held = ex('2026-10-20', { id: 'held', start: at('2026-10-09') }); // a later slot moved to a day already past
    expect(planRemoval([first, held], '2026-10-13', now)).toMatchObject({ remove: ['first'], keep: ['held'], series: { endsOn: '2026-10-13' } });
  });

  it('removes the series when no session stays', () => {
    const p = planRemoval([ex('2026-10-13'), ex('2026-10-15')], '2026-10-13', now);
    expect(p).toEqual({ remove: ['e-2026-10-13', 'e-2026-10-15'], keep: [], series: 'removed' });
  });

  it('with nothing to remove it changes nothing, not even the end of the series', () => {
    const p = planRemoval([ex('2026-10-06'), ex('2026-10-08')], '2026-10-05', now);
    expect(p).toEqual({ remove: [], keep: ['e-2026-10-06', 'e-2026-10-08'], series: 'untouched' });
    expect(planRemoval([], '2026-10-05', now)).toEqual({ remove: [], keep: [], series: 'untouched' });
  });
});
