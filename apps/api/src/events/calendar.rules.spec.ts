import type { CtxRole } from '../common/auth-context';
import { AccessRoleType, ScopeType } from '../entities/enums';
import { enrollmentCovers, seasonScope, seasonVisible } from './calendar.rules';

const at = (iso: string) => new Date(iso);

describe('enrollmentCovers: which events a person still sees through an enrollment', () => {
  it('an open enrollment covers every event of the season', () => {
    expect(enrollmentCovers(null, at('2026-10-06T16:00:00Z'))).toBe(true);
    expect(enrollmentCovers(null, at('2027-06-30T16:00:00Z'))).toBe(true);
  });

  it('a closed enrollment covers the events up to the end day and none after it', () => {
    expect(enrollmentCovers('2026-11-10', at('2026-11-09T18:00:00Z'))).toBe(true);
    expect(enrollmentCovers('2026-11-10', at('2026-11-10T18:00:00Z'))).toBe(true);
    expect(enrollmentCovers('2026-11-10', at('2026-11-11T18:00:00Z'))).toBe(false);
  });

  it('the day is the club local day, not the UTC one', () => {
    // 23:30 UTC on the 10th is already the 11th in Rome (winter time).
    expect(enrollmentCovers('2026-11-10', at('2026-11-10T23:30:00Z'))).toBe(false);
    expect(enrollmentCovers('2026-11-10', at('2026-11-10T22:30:00Z'))).toBe(true);
  });
});

describe('seasonScope: the seasons a role reads without being enrolled', () => {
  const role = (scope: ScopeType, sectionId: string | null = null, teamId: string | null = null): CtxRole => ({
    role: AccessRoleType.MANAGER,
    scope,
    sectionId,
    teamId,
  });

  it('a club role reads every season', () => {
    expect(seasonScope([role(ScopeType.CLUB)])).toEqual({ all: true });
    expect(seasonScope([role(ScopeType.TEAM, null, 't1'), role(ScopeType.CLUB)])).toEqual({ all: true });
  });

  it('section and team roles read the seasons of those sections and teams', () => {
    expect(seasonScope([role(ScopeType.SECTION, 'a1'), role(ScopeType.TEAM, 'a2', 't1'), role(ScopeType.TEAM, 'a2', 't2')])).toEqual({
      all: false,
      sectionIds: ['a1'],
      teamIds: ['t1', 't2'],
    });
  });

  it('no roles read nothing', () => {
    expect(seasonScope([])).toEqual({ all: false, sectionIds: [], teamIds: [] });
  });
});

describe('seasonVisible: scope check on a season target', () => {
  const season = { sectionId: 'a1', teamId: 't1' };
  it('follows the scope', () => {
    expect(seasonVisible({ all: true }, season)).toBe(true);
    expect(seasonVisible({ all: false, sectionIds: ['a1'], teamIds: [] }, season)).toBe(true);
    expect(seasonVisible({ all: false, sectionIds: [], teamIds: ['t1'] }, season)).toBe(true);
    expect(seasonVisible({ all: false, sectionIds: ['a2'], teamIds: ['t2'] }, season)).toBe(false);
  });
});

describe('seasonVisible: a team without a section', () => {
  const season = { sectionId: null, teamId: 't1' };
  it('is reached by a team role or the whole club, never by a section', () => {
    expect(seasonVisible({ all: true }, season)).toBe(true);
    expect(seasonVisible({ all: false, sectionIds: [], teamIds: ['t1'] }, season)).toBe(true);
    expect(seasonVisible({ all: false, sectionIds: ['a1'], teamIds: [] }, season)).toBe(false);
    expect(seasonVisible({ all: false, sectionIds: [], teamIds: [] }, season)).toBe(false);
  });
});
