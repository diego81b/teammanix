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

  it('texts live in the frontend: no Italian label in the seed', () => {
    for (const p of SPORT_PROFILES) {
      expect(p).not.toHaveProperty('name');
      expect(p).not.toHaveProperty('terminologia');
    }
  });
});
