import { AttendanceOutcome as O } from '../entities/enums';
import { countOutcomes, declaredDays, statisticsView, totalsOf } from './statistics.rules';

const season = { startDate: '2026-09-01', endDate: '2027-06-30' };

describe('declaredDays', () => {
  it('counts the days of a period, both ends included', () => {
    expect(declaredDays([{ startDate: '2026-10-01', endDate: '2026-10-03' }], season, '2027-01-01')).toBe(3);
  });

  it('counts overlapping and touching periods once', () => {
    const periods = [
      { startDate: '2026-10-01', endDate: '2026-10-05' },
      { startDate: '2026-10-04', endDate: '2026-10-08' },
      { startDate: '2026-10-09', endDate: '2026-10-10' },
    ];
    expect(declaredDays(periods, season, '2027-01-01')).toBe(10);
  });

  it('stops at today: future days are not lived yet', () => {
    expect(declaredDays([{ startDate: '2026-10-01', endDate: '2026-10-10' }], season, '2026-10-04')).toBe(4);
  });

  it('an open ended period runs to today, or to the end of a closed season', () => {
    expect(declaredDays([{ startDate: '2027-06-20', endDate: null }], season, '2027-06-25')).toBe(6);
    expect(declaredDays([{ startDate: '2027-06-20', endDate: null }], season, '2028-01-01')).toBe(11);
  });

  it('cuts what falls outside the season', () => {
    expect(declaredDays([{ startDate: '2026-08-30', endDate: '2026-09-02' }], season, '2027-01-01')).toBe(2);
    expect(declaredDays([{ startDate: '2027-07-01', endDate: '2027-07-09' }], season, '2028-01-01')).toBe(0);
  });

  it('is zero with nothing declared', () => {
    expect(declaredDays([], season, '2027-01-01')).toBe(0);
  });
});

describe('countOutcomes', () => {
  it('counts each outcome and leaves the injured and the unrecorded out of the rate', () => {
    const c = countOutcomes([O.PRESENT, O.PRESENT, O.LATE, O.ABSENT_EXCUSED, O.ABSENT, O.INJURED, O.INJURED]);
    expect(c).toEqual({ present: 2, late: 1, absentExcused: 1, absent: 1, injured: 2, attended: 3, rate: 3 / 5 });
  });

  it('has no rate when nobody was available', () => {
    expect(countOutcomes([O.INJURED]).rate).toBeNull();
    expect(countOutcomes([]).rate).toBeNull();
  });
});

describe('totalsOf', () => {
  it('sums the counts and computes the rate from the sums, not as a mean of rates', () => {
    const a = countOutcomes([O.PRESENT, O.ABSENT]);
    const b = countOutcomes([O.PRESENT, O.PRESENT, O.PRESENT, O.PRESENT, O.INJURED]);
    expect(totalsOf([a, b])).toEqual({ present: 5, late: 0, absentExcused: 0, absent: 1, injured: 1, attended: 5, rate: 5 / 6 });
  });

  it('is empty for no rows', () => {
    expect(totalsOf([])).toEqual({ present: 0, late: 0, absentExcused: 0, absent: 0, injured: 0, attended: 0, rate: null });
  });
});

describe('statisticsView', () => {
  const none = { isStaff: false, isAdmin: false, readsSeason: false, isPlayer: false };
  it('staff of the season and the admin read every player', () => {
    expect(statisticsView({ ...none, isStaff: true })).toBe('full');
    expect(statisticsView({ ...none, isAdmin: true, readsSeason: true })).toBe('full');
  });
  it('a manager in scope reads the team totals only', () => {
    expect(statisticsView({ ...none, readsSeason: true })).toBe('totals');
  });
  it('a player reads only their own figures', () => {
    expect(statisticsView({ ...none, isPlayer: true })).toBe('own');
  });
  it('a staff member who is also a player reads the whole team', () => {
    expect(statisticsView({ ...none, isStaff: true, isPlayer: true })).toBe('full');
  });
  it('a manager who is also a player reads the totals and their own row', () => {
    expect(statisticsView({ ...none, readsSeason: true, isPlayer: true })).toBe('totals');
  });
  it('anybody else is refused', () => {
    expect(statisticsView(none)).toBe('none');
  });
});
