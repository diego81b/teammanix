import { SeasonStatus } from '../entities/enums';
import { validIsoDate, editable, periodValid, periodsOverlap, canActivate, canClose } from './season.rules';

describe('validIsoDate', () => {
  it.each(['2026-09-01', '2028-02-29', '1999-12-31'])('accetta %s', (d) => expect(validIsoDate(d)).toBe(true));
  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-9-1', '01/09/2026', '', 'boh', '2026-09-01T00:00:00Z'])(
    'rifiuta %s',
    (d) => expect(validIsoDate(d)).toBe(false),
  );
  it('rejects non-string values', () => {
    for (const v of [null, undefined, 20260901, {}]) expect(validIsoDate(v)).toBe(false);
  });
});

describe('periodValid', () => {
  it('end equal to or after the start', () => {
    expect(periodValid('2026-09-01', '2027-06-30')).toBe(true);
    expect(periodValid('2026-09-01', '2026-09-01')).toBe(true);
  });
  it('end before the start', () => {
    expect(periodValid('2026-09-02', '2026-09-01')).toBe(false);
  });
  it('invalid dates', () => {
    expect(periodValid('2026-02-30', '2027-06-30')).toBe(false);
    expect(periodValid('2026-09-01', 'x')).toBe(false);
  });
});

describe('periodsOverlap', () => {
  it.each([
    ['nested', '2026-09-01', '2027-06-30', '2026-10-01', '2026-12-31'],
    ['identical', '2026-09-01', '2027-06-30', '2026-09-01', '2027-06-30'],
    ['partial', '2026-09-01', '2027-06-30', '2027-01-01', '2027-12-31'],
    ['touching on one day', '2026-09-01', '2027-06-30', '2027-06-30', '2028-06-30'],
  ])('%s periods overlap, in either order', (_, aStart, aEnd, bStart, bEnd) => {
    expect(periodsOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
    expect(periodsOverlap(bStart, bEnd, aStart, aEnd)).toBe(true);
  });
  it.each([
    ['disjoint', '2026-09-01', '2027-06-30', '2028-09-01', '2029-06-30'],
    ['starting the day after', '2026-09-01', '2027-06-30', '2027-07-01', '2028-06-30'],
  ])('%s periods do not overlap, in either order', (_, aStart, aEnd, bStart, bEnd) => {
    expect(periodsOverlap(aStart, aEnd, bStart, bEnd)).toBe(false);
    expect(periodsOverlap(bStart, bEnd, aStart, aEnd)).toBe(false);
  });
});

describe('season status', () => {
  it('only a draft can be activated', () => {
    expect(canActivate(SeasonStatus.DRAFT)).toBe(true);
    expect(canActivate(SeasonStatus.ACTIVE)).toBe(false);
    expect(canActivate(SeasonStatus.CLOSED)).toBe(false);
  });
  it('only an active season can be closed (rule 8)', () => {
    expect(canClose(SeasonStatus.ACTIVE)).toBe(true);
    expect(canClose(SeasonStatus.DRAFT)).toBe(false);
    expect(canClose(SeasonStatus.CLOSED)).toBe(false);
  });
  it('a closed season is read-only (rule 7)', () => {
    expect(editable(SeasonStatus.DRAFT)).toBe(true);
    expect(editable(SeasonStatus.ACTIVE)).toBe(true);
    expect(editable(SeasonStatus.CLOSED)).toBe(false);
  });
});
