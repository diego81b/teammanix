import { CallupResponse } from '../entities/enums';
import { blockOn, declinable, mergePeriods, validatePeriod } from './absence.rules';

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
