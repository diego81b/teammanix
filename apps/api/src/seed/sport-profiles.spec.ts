import { SPORT_PROFILES } from './sport-profiles';

const CODE = /^[a-z][a-z0-9_]*$/;

describe('sport profiles (seed)', () => {
  it('stable codes: profiles and positions are lowercase with underscores, never labels', () => {
    for (const p of SPORT_PROFILES) {
      expect(p.code).toMatch(CODE);
      for (const pos of p.positions) expect(pos).toMatch(CODE);
      for (const m of p.modulesAvailable) expect(m).toMatch(CODE);
    }
  });

  it('no duplicates among profiles or among the positions of one profile', () => {
    expect(new Set(SPORT_PROFILES.map((p) => p.code)).size).toBe(SPORT_PROFILES.length);
    for (const p of SPORT_PROFILES) expect(new Set(p.positions).size).toBe(p.positions.length);
  });

  it('the maximum number of starters makes sense only with starters and bench enabled', () => {
    for (const p of SPORT_PROFILES) {
      if (p.starterBench) expect(p.maxStarters).toBeGreaterThan(0);
      else expect(p.maxStarters).toBeNull();
    }
  });

  it('every profile names its team unit with a code: group for fencing, team for the others', () => {
    for (const p of SPORT_PROFILES) expect(p.unitTerm).toBe(p.code === 'fencing' ? 'group' : 'team');
  });

  it('texts live in the frontend: no Italian label in the seed', () => {
    for (const p of SPORT_PROFILES) {
      expect(p).not.toHaveProperty('name');
      expect(p).not.toHaveProperty('terminologia');
    }
  });
});

describe('sport profiles (seed): suggested staff roles', () => {
  const MODELS = ['coach', 'assistant_coach', 'trainer', 'none'];

  it('codes are lowercase with underscores, never labels, and the model is one of the four', () => {
    for (const p of SPORT_PROFILES) {
      for (const r of p.suggestedStaffRoles) {
        expect(r.code).toMatch(CODE);
        expect(MODELS).toContain(r.policyModel);
        expect(typeof r.mustBeAvailable).toBe('boolean');
        expect(Object.keys(r).sort()).toEqual(['code', 'mustBeAvailable', 'policyModel']);
      }
    }
  });

  it('no duplicate code within a profile', () => {
    for (const p of SPORT_PROFILES) expect(new Set(p.suggestedStaffRoles.map((r) => r.code)).size).toBe(p.suggestedStaffRoles.length);
  });

  it('the generic profile suggests nothing, fencing suggests master and instructor, football the goalkeeper coach', () => {
    const codes = (profile: string) => SPORT_PROFILES.find((p) => p.code === profile)?.suggestedStaffRoles.map((r) => r.code);
    expect(codes('generic')).toEqual([]);
    expect(codes('fencing')).toEqual(['master', 'instructor']);
    expect(codes('football')).toEqual(['goalkeeper_coach']);
  });
});
