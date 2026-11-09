import { EventStatus, EventType, HomeAway, SeasonStatus } from '../entities/enums';
import {
  canChangeStatus,
  canPlanEvents,
  clearMatchFields,
  editableEvent,
  eventIssue,
  insideSeason,
  localDate,
  normalizeName,
  nameKey,
  parseInstant,
  type EventFields,
} from './event.rules';

const at = (iso: string) => new Date(iso);

const training: EventFields = {
  type: EventType.TRAINING,
  start: at('2026-10-06T16:00:00Z'),
  end: at('2026-10-06T17:30:00Z'),
  hasOpponent: false,
  homeAway: null,
  competition: null,
};
const match: EventFields = { ...training, type: EventType.MATCH, hasOpponent: true, homeAway: HomeAway.HOME };

describe('localDate', () => {
  it('uses the club timezone, not UTC', () => {
    expect(localDate(at('2026-09-01T22:30:00Z'))).toBe('2026-09-02');
    expect(localDate(at('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
  it('follows daylight saving: same UTC hour, different local day around midnight', () => {
    // 22:30 UTC is 00:30 in summer (UTC+2) and 23:30 in winter (UTC+1).
    expect(localDate(at('2026-07-10T22:30:00Z'))).toBe('2026-07-11');
    expect(localDate(at('2026-12-10T22:30:00Z'))).toBe('2026-12-10');
  });
});

describe('insideSeason', () => {
  const season = { startDate: '2026-09-01', endDate: '2027-06-30' };
  it('accepts an event inside the dates', () => {
    expect(insideSeason(at('2026-10-06T16:00:00Z'), at('2026-10-06T17:00:00Z'), season)).toBe(true);
  });
  it('compares local days: 00:30 local on the first day is inside', () => {
    expect(insideSeason(at('2026-08-31T22:30:00Z'), at('2026-08-31T23:30:00Z'), season)).toBe(true);
  });
  it('refuses 23:59 local the day before the start', () => {
    expect(insideSeason(at('2026-08-31T21:59:00Z'), at('2026-08-31T22:10:00Z'), season)).toBe(false);
  });
  it('refuses an event that ends the day after the last day', () => {
    expect(insideSeason(at('2027-06-30T20:00:00Z'), at('2027-06-30T22:30:00Z'), season)).toBe(false);
    expect(insideSeason(at('2027-06-30T20:00:00Z'), at('2027-06-30T21:30:00Z'), season)).toBe(true);
  });
});

describe('parseInstant', () => {
  it('accepts an ISO datetime with Z or an offset', () => {
    expect(parseInstant('2026-10-06T16:00:00Z')?.toISOString()).toBe('2026-10-06T16:00:00.000Z');
    expect(parseInstant('2026-10-06T18:00+02:00')?.toISOString()).toBe('2026-10-06T16:00:00.000Z');
    expect(parseInstant('2026-10-06T16:00:00.500Z')?.getUTCMilliseconds()).toBe(500);
  });
  it('rejects a datetime without offset: its meaning would depend on the server', () => {
    expect(parseInstant('2026-10-06T16:00:00')).toBeNull();
    expect(parseInstant('2026-10-06')).toBeNull();
  });
  it('rejects days and hours that do not exist', () => {
    expect(parseInstant('2026-02-30T10:00:00Z')).toBeNull();
    expect(parseInstant('2026-10-06T25:00:00Z')).toBeNull();
    expect(parseInstant('2026-10-06T16:61:00Z')).toBeNull();
  });
  it('rejects non-strings and garbage', () => {
    for (const v of [null, undefined, 1760000000000, {}, '', 'tomorrow']) expect(parseInstant(v)).toBeNull();
  });
});

describe('canPlanEvents', () => {
  it('only an active season (a draft is for the roster, a closed one is read-only)', () => {
    expect(canPlanEvents(SeasonStatus.ACTIVE)).toBe(true);
    expect(canPlanEvents(SeasonStatus.DRAFT)).toBe(false);
    expect(canPlanEvents(SeasonStatus.CLOSED)).toBe(false);
  });
});

describe('eventIssue', () => {
  it('a valid training and a valid match have no issue', () => {
    expect(eventIssue(training)).toBeNull();
    expect(eventIssue(match)).toBeNull();
  });
  it('the end must be after the start', () => {
    expect(eventIssue({ ...training, end: training.start })).toBe('period');
    expect(eventIssue({ ...training, end: at('2026-10-06T15:00:00Z') })).toBe('period');
  });
  it('an invalid date is a period issue, not a crash', () => {
    expect(eventIssue({ ...training, start: new Date('x') })).toBe('period');
  });
  it('a match needs opponent and home or away', () => {
    expect(eventIssue({ ...match, hasOpponent: false })).toBe('match_incomplete');
    expect(eventIssue({ ...match, homeAway: null })).toBe('match_incomplete');
  });
  it('a neutral ground is a valid match', () => {
    expect(eventIssue({ ...match, homeAway: HomeAway.NEUTRAL })).toBeNull();
  });
  it('match fields on other types are refused, competition included', () => {
    expect(eventIssue({ ...training, hasOpponent: true })).toBe('match_fields_not_allowed');
    expect(eventIssue({ ...training, homeAway: HomeAway.AWAY })).toBe('match_fields_not_allowed');
    expect(eventIssue({ ...training, competition: 'Cup' })).toBe('match_fields_not_allowed');
    expect(eventIssue({ ...match, type: EventType.OTHER })).toBe('match_fields_not_allowed');
  });
  it('the competition is optional for a match', () => {
    expect(eventIssue({ ...match, competition: 'Cup' })).toBeNull();
  });
});

describe('clearMatchFields', () => {
  it('switching away from match drops the match fields', () => {
    const out = clearMatchFields({ ...match, competition: 'Cup', type: EventType.TRAINING });
    expect(out).toMatchObject({ hasOpponent: false, homeAway: null, competition: null });
    expect(eventIssue(out)).toBeNull();
  });
  it('a match keeps them', () => {
    const m = { ...match, competition: 'Cup' };
    expect(clearMatchFields(m)).toEqual(m);
  });
});

describe('status', () => {
  const S = EventStatus;
  it('scheduled can be cancelled or postponed', () => {
    expect(canChangeStatus(S.SCHEDULED, S.CANCELLED)).toBe(true);
    expect(canChangeStatus(S.SCHEDULED, S.POSTPONED)).toBe(true);
  });
  it('postponed goes back to scheduled with new dates, or is cancelled', () => {
    expect(canChangeStatus(S.POSTPONED, S.SCHEDULED)).toBe(true);
    expect(canChangeStatus(S.POSTPONED, S.CANCELLED)).toBe(true);
  });
  it('cancelled and concluded are terminal', () => {
    for (const to of [S.SCHEDULED, S.POSTPONED, S.CANCELLED, S.CONCLUDED]) {
      expect(canChangeStatus(S.CANCELLED, to)).toBe(false);
      expect(canChangeStatus(S.CONCLUDED, to)).toBe(false);
    }
  });
  it('no transition to the same status', () => {
    expect(canChangeStatus(S.SCHEDULED, S.SCHEDULED)).toBe(false);
    expect(canChangeStatus(S.POSTPONED, S.POSTPONED)).toBe(false);
  });
  it('scheduled and postponed events are editable, the others are not', () => {
    expect(editableEvent(S.SCHEDULED)).toBe(true);
    expect(editableEvent(S.POSTPONED)).toBe(true);
    expect(editableEvent(S.CANCELLED)).toBe(false);
    expect(editableEvent(S.CONCLUDED)).toBe(false);
  });
});

describe('opponent and venue names', () => {
  it('normalizeName trims and collapses inner spaces', () => {
    expect(normalizeName('  ASD   Virtus  ')).toBe('ASD Virtus');
  });
  it('nameKey is case and accent insensitive for the same name', () => {
    expect(nameKey('ASD  Virtus')).toBe(nameKey('asd virtus'));
    expect(nameKey('Città')).toBe(nameKey('CITTA'));
  });
  it('different names have different keys', () => {
    expect(nameKey('Virtus A')).not.toBe(nameKey('Virtus B'));
  });
});
