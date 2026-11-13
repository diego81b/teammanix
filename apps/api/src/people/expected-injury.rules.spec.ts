import { currentExpected, expectedOn, validateExpected } from './expected-injury.rules';

describe('validating an expected injury period', () => {
  it('accepts real days with the return after the start', () => {
    expect(validateExpected({ startDate: '2026-11-10', returnDate: '2026-11-24' })).toBe('ok');
  });

  it('refuses a return on the start day or before it', () => {
    expect(validateExpected({ startDate: '2026-11-10', returnDate: '2026-11-10' })).toBe('INVALID_DATA');
    expect(validateExpected({ startDate: '2026-11-10', returnDate: '2026-11-09' })).toBe('INVALID_DATA');
  });

  it('refuses days that do not exist', () => {
    expect(validateExpected({ startDate: '2026-02-30', returnDate: '2026-03-10' })).toBe('INVALID_DATA');
    expect(validateExpected({ startDate: '2026-11-10', returnDate: 'soon' })).toBe('INVALID_DATA');
  });
});

describe('the expected injury on a day', () => {
  const p = { startDate: '2026-11-10', returnDate: '2026-11-24' };

  it('covers from the start day', () => {
    expect(expectedOn([p], '2026-11-10')).toEqual({ until: '2026-11-24' });
  });

  it('the return day is the first day available again', () => {
    expect(expectedOn([p], '2026-11-23')).toEqual({ until: '2026-11-24' });
    expect(expectedOn([p], '2026-11-24')).toBeNull();
  });

  it('a period that ends before the day, or starts after it, says nothing', () => {
    expect(expectedOn([p], '2026-12-01')).toBeNull();
    expect(expectedOn([p], '2026-11-09')).toBeNull();
    expect(expectedOn([], '2026-11-15')).toBeNull();
  });

  it('periods from more teams: the latest return wins', () => {
    expect(expectedOn([p, { startDate: '2026-11-12', returnDate: '2026-11-30' }], '2026-11-15')).toEqual({ until: '2026-11-30' });
  });
});

describe('the period still running, as the player and the roster read it', () => {
  const p = { startDate: '2026-11-10', returnDate: '2026-11-24' };

  it('a period not over yet, even one that starts later, is shown', () => {
    expect(currentExpected([p], '2026-11-01')).toEqual(p);
    expect(currentExpected([p], '2026-11-23')).toEqual(p);
  });

  it('from the return day on, nothing', () => {
    expect(currentExpected([p], '2026-11-24')).toBeNull();
    expect(currentExpected([], '2026-11-01')).toBeNull();
  });

  it('periods from more teams: the latest return wins', () => {
    const later = { startDate: '2026-11-12', returnDate: '2026-11-30' };
    expect(currentExpected([later, p], '2026-11-15')).toEqual(later);
  });
});
