import { AttendanceOutcome as O, EventStatus, SeasonStatus } from '../entities/enums';
import { disabledMask, recordable, summarize, viewOf } from './attendance.rules';

const now = new Date('2026-11-10T20:00:00Z');
const started = { start: new Date('2026-11-10T17:00:00Z'), status: EventStatus.SCHEDULED };

describe('recordable', () => {
  it('accepts an event that already started, in the active season', () => {
    expect(recordable(started, SeasonStatus.ACTIVE, now)).toBe('ok');
  });

  it('accepts a concluded event', () => {
    expect(recordable({ ...started, status: EventStatus.CONCLUDED }, SeasonStatus.ACTIVE, now)).toBe('ok');
  });

  it('accepts an event that was played long ago: corrections are open until the season closes', () => {
    expect(recordable({ start: new Date('2026-09-05T17:00:00Z'), status: EventStatus.SCHEDULED }, SeasonStatus.ACTIVE, now)).toBe('ok');
  });

  it('refuses an event that did not start yet', () => {
    expect(recordable({ start: new Date('2026-11-10T21:00:00Z'), status: EventStatus.SCHEDULED }, SeasonStatus.ACTIVE, now)).toBe('EVENT_NOT_STARTED');
  });

  it('refuses a cancelled event even if the time has passed', () => {
    expect(recordable({ ...started, status: EventStatus.CANCELLED }, SeasonStatus.ACTIVE, now)).toBe('EVENT_NOT_RECORDABLE');
  });

  it('refuses a postponed event: it has not been played', () => {
    expect(recordable({ ...started, status: EventStatus.POSTPONED }, SeasonStatus.ACTIVE, now)).toBe('EVENT_NOT_RECORDABLE');
  });

  it('refuses a closed season, read only (rule 7)', () => {
    expect(recordable(started, SeasonStatus.CLOSED, now)).toBe('SEASON_CLOSED');
  });
});

describe('viewOf', () => {
  const base = { canRecord: false, isStaff: false, isPlayer: false, readsSeason: false };

  it('who may record manages', () => {
    expect(viewOf({ ...base, canRecord: true, isStaff: true })).toBe('manage');
  });

  it('staff without the policy read every row but cannot write', () => {
    expect(viewOf({ ...base, isStaff: true })).toBe('read');
  });

  it('a manager in scope sees statistics only', () => {
    expect(viewOf({ ...base, readsSeason: true })).toBe('stats');
  });

  it('a player sees their own result and the staff present', () => {
    expect(viewOf({ ...base, isPlayer: true })).toBe('player');
  });

  it('anybody else sees nothing', () => {
    expect(viewOf(base)).toBe('none');
  });
});

describe('summarize', () => {
  it('counts each outcome and the people not recorded; late counts as attended', () => {
    const rows = [O.PRESENT, O.PRESENT, O.LATE, O.ABSENT, O.ABSENT_EXCUSED, null];
    expect(summarize(rows)).toEqual({ present: 2, late: 1, absentExcused: 1, absent: 1, injured: 0, notRecorded: 1, total: 6, attended: 3, rate: 0.6 });
  });

  it('who is injured is counted apart and does not weigh on the rate: it measures who was available', () => {
    const s = summarize([O.PRESENT, O.ABSENT, O.INJURED, O.INJURED, null]);
    expect(s).toMatchObject({ injured: 2, attended: 1, notRecorded: 1, total: 5, rate: 0.5 });
  });

  it('with only injured people recorded there is no rate', () => {
    expect(summarize([O.INJURED, O.INJURED, null]).rate).toBeNull();
  });

  it('the rate is over the people recorded: who has no row does not weigh on it', () => {
    expect(summarize([O.PRESENT, O.ABSENT, null, null]).rate).toBe(0.5);
  });

  it('with nobody recorded there is no rate', () => {
    expect(summarize([null, null]).rate).toBeNull();
  });

  it('an empty list is all zeros and has no rate', () => {
    expect(summarize([])).toEqual({ present: 0, late: 0, absentExcused: 0, absent: 0, injured: 0, notRecorded: 0, total: 0, attended: 0, rate: null });
  });
});

describe('disabledMask', () => {
  const row = { name: 'Mario', surname: 'Rossi', disabled: true };

  it('hides the person from everybody but the admin: the row stays for the totals', () => {
    expect(disabledMask(row, false)).toEqual({ name: null, surname: null, disabled: true });
  });

  it('the admin sees the person', () => {
    expect(disabledMask(row, true)).toEqual(row);
  });

  it('an active person is never masked', () => {
    const active = { name: 'Anna', surname: 'Verdi', disabled: false };
    expect(disabledMask(active, false)).toEqual(active);
  });
});
