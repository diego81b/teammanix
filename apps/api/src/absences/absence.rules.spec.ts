import { CallupResponse } from '../entities/enums';
import { blockOn, declinable, freeDays, mergePeriods, validatePeriod } from './absence.rules';

const season = { startDate: '2026-09-01', endDate: '2027-06-30' };

describe('validatePeriod', () => {
  it('accepts a period inside the season, with or without an end', () => {
    expect(validatePeriod({ startDate: '2026-11-10', endDate: '2026-11-15' }, season)).toBe('ok');
    expect(validatePeriod({ startDate: '2026-11-10', endDate: null }, season)).toBe('ok');
    expect(validatePeriod({ startDate: '2026-11-10', endDate: '2026-11-10' }, season)).toBe('ok');
  });

  it('accepts the first and the last day of the season', () => {
    expect(validatePeriod({ startDate: '2026-09-01', endDate: '2027-06-30' }, season)).toBe('ok');
  });

  it('refuses an end before the start', () => {
    expect(validatePeriod({ startDate: '2026-11-15', endDate: '2026-11-10' }, season)).toBe('INVALID_DATA');
  });

  it('refuses dates that are not real calendar days', () => {
    expect(validatePeriod({ startDate: '2026-02-30', endDate: null }, season)).toBe('INVALID_DATA');
    expect(validatePeriod({ startDate: '10/11/2026', endDate: null }, season)).toBe('INVALID_DATA');
    expect(validatePeriod({ startDate: '2026-11-10', endDate: '2026-13-01' }, season)).toBe('INVALID_DATA');
  });

  it('refuses a period that starts or ends outside the season', () => {
    expect(validatePeriod({ startDate: '2026-08-31', endDate: null }, season)).toBe('ABSENCE_OUTSIDE_SEASON');
    expect(validatePeriod({ startDate: '2026-11-10', endDate: '2027-07-01' }, season)).toBe('ABSENCE_OUTSIDE_SEASON');
  });
});

describe('mergePeriods', () => {
  it('fuses overlapping periods', () => {
    expect(
      mergePeriods([
        { startDate: '2026-11-10', endDate: '2026-11-15' },
        { startDate: '2026-11-12', endDate: '2026-11-20' },
      ]),
    ).toEqual([{ startDate: '2026-11-10', endDate: '2026-11-20' }]);
  });

  it('fuses adjacent periods, the day after the end counts as adjacent', () => {
    expect(
      mergePeriods([
        { startDate: '2026-11-16', endDate: '2026-11-20' },
        { startDate: '2026-11-10', endDate: '2026-11-15' },
      ]),
    ).toEqual([{ startDate: '2026-11-10', endDate: '2026-11-20' }]);
  });

  it('keeps apart periods with a free day between them', () => {
    expect(
      mergePeriods([
        { startDate: '2026-11-10', endDate: '2026-11-14' },
        { startDate: '2026-11-16', endDate: '2026-11-20' },
      ]),
    ).toEqual([
      { startDate: '2026-11-10', endDate: '2026-11-14' },
      { startDate: '2026-11-16', endDate: '2026-11-20' },
    ]);
  });

  it('lets an open period swallow everything after its start', () => {
    expect(
      mergePeriods([
        { startDate: '2026-11-10', endDate: null },
        { startDate: '2026-12-01', endDate: '2026-12-05' },
      ]),
    ).toEqual([{ startDate: '2026-11-10', endDate: null }]);
  });

  it('fuses across months and years, where the next day is not +1 on the string', () => {
    expect(
      mergePeriods([
        { startDate: '2026-12-20', endDate: '2026-12-31' },
        { startDate: '2027-01-01', endDate: '2027-01-05' },
        { startDate: '2027-02-28', endDate: '2027-02-28' },
        { startDate: '2027-03-01', endDate: '2027-03-02' },
      ]),
    ).toEqual([
      { startDate: '2026-12-20', endDate: '2027-01-05' },
      { startDate: '2027-02-28', endDate: '2027-03-02' },
    ]);
  });

  it('does not change its input and handles an empty list', () => {
    const input = [{ startDate: '2026-11-10', endDate: '2026-11-15' }];
    mergePeriods(input);
    expect(input).toEqual([{ startDate: '2026-11-10', endDate: '2026-11-15' }]);
    expect(mergePeriods([])).toEqual([]);
  });
});

describe('blockOn', () => {
  const periods = [
    { startDate: '2026-11-10', endDate: '2026-11-15' },
    { startDate: '2026-11-16', endDate: '2026-11-20' },
    { startDate: '2026-12-24', endDate: '2026-12-26' },
  ];

  it('is null outside any absence', () => {
    expect(blockOn(periods, '2026-11-09')).toBeNull();
    expect(blockOn(periods, '2026-11-21')).toBeNull();
    expect(blockOn([], '2026-11-12')).toBeNull();
  });

  it('includes the first and the last day', () => {
    expect(blockOn(periods, '2026-11-10')).toEqual({ until: '2026-11-20' });
    expect(blockOn(periods, '2026-12-26')).toEqual({ until: '2026-12-26' });
  });

  it('gives the end of the continuous block, not of the single period', () => {
    expect(blockOn(periods, '2026-11-12')).toEqual({ until: '2026-11-20' });
  });

  it('has no end for an absence until further notice', () => {
    expect(blockOn([{ startDate: '2026-11-10', endDate: null }], '2027-05-01')).toEqual({ until: null });
    expect(blockOn([{ startDate: '2026-11-10', endDate: null }], '2026-11-09')).toBeNull();
  });
});

describe('declinable', () => {
  const row = (eventId: string, day: string, over: Partial<{ response: CallupResponse; open: boolean }> = {}) => ({
    eventId,
    day,
    response: CallupResponse.PENDING,
    open: true,
    ...over,
  });
  const period = { startDate: '2026-11-10', endDate: '2026-11-15' };

  it('keeps only the call-ups inside the period', () => {
    const rows = [row('a', '2026-11-09'), row('b', '2026-11-10'), row('c', '2026-11-15'), row('d', '2026-11-16')];
    expect(declinable(rows, period).map((r) => r.eventId)).toEqual(['b', 'c']);
  });

  it('drops the ones already declined and the events that can no longer change', () => {
    const rows = [
      row('a', '2026-11-12', { response: CallupResponse.DECLINED }),
      row('b', '2026-11-12', { open: false }),
      row('c', '2026-11-12', { response: CallupResponse.CONFIRMED }),
      row('d', '2026-11-12'),
    ];
    expect(declinable(rows, period).map((r) => r.eventId)).toEqual(['c', 'd']);
  });

  it('has no upper bound for an absence until further notice', () => {
    expect(declinable([row('a', '2027-05-01')], { startDate: '2026-11-10', endDate: null })).toHaveLength(1);
  });
});

describe('freeDays', () => {
  const today = '2026-12-01';
  const p = (id: string, startDate: string, endDate: string | null) => ({ id, startDate, endDate });
  const plan = (periods: ReturnType<typeof p>[], from: string, to: string | null) => {
    const r = freeDays(periods, { from, to }, today);
    if ('error' in r) throw new Error(r.error);
    return r;
  };

  it('splits a period when the freed days are in the middle: the first part keeps the start, the second the end', () => {
    const r = plan([p('a', '2026-12-01', '2026-12-20')], '2026-12-10', '2026-12-12');
    expect(r.updates).toEqual([{ id: 'a', startDate: '2026-12-01', endDate: '2026-12-09' }]);
    expect(r.creates).toEqual([{ startDate: '2026-12-13', endDate: '2026-12-20' }]);
    expect(r.removes).toEqual([]);
  });

  it('shortens a period when the freed days are at its end', () => {
    const r = plan([p('a', '2026-12-01', '2026-12-20')], '2026-12-18', '2026-12-20');
    expect(r).toEqual({ updates: [{ id: 'a', startDate: '2026-12-01', endDate: '2026-12-17' }], creates: [], removes: [] });
  });

  it('shortens a period when the freed days are at its start', () => {
    const r = plan([p('a', '2026-12-05', '2026-12-20')], '2026-12-03', '2026-12-08');
    expect(r).toEqual({ updates: [{ id: 'a', startDate: '2026-12-09', endDate: '2026-12-20' }], creates: [], removes: [] });
  });

  it('removes a period fully inside the freed days, a single day included', () => {
    const r = plan([p('a', '2026-12-01', '2026-12-20'), p('b', '2026-12-05', '2026-12-05')], '2026-12-01', '2026-12-20');
    expect(r).toEqual({ updates: [], creates: [], removes: ['a', 'b'] });
  });

  it('treats each declared period by the same rules in one operation', () => {
    const r = plan(
      [p('a', '2026-12-03', '2026-12-03'), p('b', '2026-12-05', '2026-12-05'), p('c', '2026-12-08', '2026-12-09'), p('d', '2026-12-04', '2026-12-30')],
      '2026-12-04',
      '2026-12-08',
    );
    expect(r.removes.sort()).toEqual(['b']);
    expect(r.updates).toEqual(
      expect.arrayContaining([
        { id: 'c', startDate: '2026-12-09', endDate: '2026-12-09' },
        { id: 'd', startDate: '2026-12-09', endDate: '2026-12-30' },
      ]),
    );
    expect(r.updates).toHaveLength(2);
    expect(r.creates).toEqual([]);
  });

  it('frees a day covered by two overlapping periods from both', () => {
    const periods = [p('a', '2026-12-01', '2026-12-10'), p('b', '2026-12-08', '2026-12-20')];
    const r = plan(periods, '2026-12-09', '2026-12-09');
    const after = [
      ...periods.filter((x) => !r.removes.includes(x.id)).map((x) => r.updates.find((u) => u.id === x.id) ?? x),
      ...r.creates,
    ];
    expect(after.some((x) => x.startDate <= '2026-12-09' && (x.endDate === null || x.endDate >= '2026-12-09'))).toBe(false);
    expect(after.some((x) => x.startDate <= '2026-12-08' && (x.endDate === null || x.endDate >= '2026-12-08'))).toBe(true);
    expect(after.some((x) => x.startDate <= '2026-12-10' && (x.endDate === null || x.endDate >= '2026-12-10'))).toBe(true);
  });

  it('leaves the second part open ended when freeing the middle of an absence until further notice', () => {
    const r = plan([p('a', '2026-12-01', null)], '2026-12-10', '2026-12-12');
    expect(r.updates).toEqual([{ id: 'a', startDate: '2026-12-01', endDate: '2026-12-09' }]);
    expect(r.creates).toEqual([{ startDate: '2026-12-13', endDate: null }]);
  });

  it('ends an absence until further notice the day before when freeing from a day onward', () => {
    const r = plan([p('a', '2026-12-01', null)], '2026-12-10', null);
    expect(r).toEqual({ updates: [{ id: 'a', startDate: '2026-12-01', endDate: '2026-12-09' }], creates: [], removes: [] });
  });

  it('removes a period that starts inside the days freed onward', () => {
    expect(plan([p('a', '2026-12-15', '2026-12-18'), p('b', '2026-12-20', null)], '2026-12-10', null)).toEqual({
      updates: [],
      creates: [],
      removes: ['a', 'b'],
    });
  });

  it('changes nothing when nothing is declared in the range', () => {
    const r = plan([p('a', '2026-12-01', '2026-12-05'), p('b', '2026-12-20', '2026-12-25')], '2026-12-10', '2026-12-12');
    expect(r).toEqual({ updates: [], creates: [], removes: [] });
  });

  it('allows today and refuses a range that starts before today', () => {
    expect(freeDays([p('a', '2026-12-01', '2026-12-20')], { from: '2026-12-01', to: '2026-12-02' }, today)).toEqual({
      updates: [{ id: 'a', startDate: '2026-12-03', endDate: '2026-12-20' }],
      creates: [],
      removes: [],
    });
    expect(freeDays([p('a', '2026-11-20', '2026-12-20')], { from: '2026-11-30', to: '2026-12-05' }, today)).toEqual({ error: 'ABSENCE_DAYS_IN_PAST' });
    expect(freeDays([], { from: '2026-11-30', to: null }, today)).toEqual({ error: 'ABSENCE_DAYS_IN_PAST' });
  });

  it('never touches past days: the past part of a period stays as declared', () => {
    const r = plan([p('a', '2026-11-20', '2026-12-20')], '2026-12-05', null);
    expect(r.updates).toEqual([{ id: 'a', startDate: '2026-11-20', endDate: '2026-12-04' }]);
  });

  it('refuses days that are not real or an end before the start', () => {
    expect(freeDays([], { from: '2026-12-32', to: null }, today)).toEqual({ error: 'INVALID_DATA' });
    expect(freeDays([], { from: '2026-12-10', to: '2026-12-09' }, today)).toEqual({ error: 'INVALID_DATA' });
    expect(freeDays([], { from: '2026-12-10', to: '2026-13-01' }, today)).toEqual({ error: 'INVALID_DATA' });
  });
});
