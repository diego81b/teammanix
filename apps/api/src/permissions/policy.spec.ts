import {
  computeDiff,
  ePolicyKey,
  effective,
  templateDefault,
  POLICY,
  defaultValue,
  can,
  sees,
  validateDiff,
  type Target,
  type Source,
} from './policy';

const CLUB = { type: 'club' } as const;
const section = (sectionId: string) => ({ type: 'section', sectionId }) as const;
const team = (teamId: string) => ({ type: 'team', teamId }) as const;
const on = (sectionId: string | null, teamId: string | null): Target => ({ sectionId, teamId });

describe('default templates (rule 14)', () => {
  it('admin has all policies', () => {
    expect([...templateDefault('admin')].sort()).toEqual([...POLICY].sort());
  });
  it('coach: all except people.disable and certificates.file', () => {
    const expected = POLICY.filter((p) => p !== 'people.disable' && p !== 'certificates.file');
    expect([...templateDefault('coach')].sort()).toEqual([...expected].sort());
  });
  it('assistant coach', () => {
    expect([...templateDefault('assistant_coach')].sort()).toEqual(
      ['certificates.status', 'callups.manage', 'attendances.record'].sort(),
    );
  });
  it('trainer', () => {
    expect(templateDefault('trainer')).toEqual(['attendances.record']);
  });
  it('manager, player and the staff model without a template: no policy', () => {
    for (const r of ['manager', 'player', 'none'] as const) {
      expect(templateDefault(r)).toEqual([]);
    }
  });
  it('returns a copy: the template is not altered', () => {
    templateDefault('trainer').push('events.manage');
    expect(templateDefault('trainer')).toEqual(['attendances.record']);
  });
});

describe('ePolicyKey', () => {
  it('recognises only known keys', () => {
    expect(ePolicyKey('people.manage')).toBe(true);
    for (const v of ['people', 'admin.tutto', '', null, undefined, 3]) expect(ePolicyKey(v)).toBe(false);
  });
});

describe('can', () => {
  const adminSource: Source = { role: 'admin', scope: CLUB };

  it('admin can do anything anywhere, even at club level', () => {
    for (const p of POLICY) {
      expect(can([adminSource], {}, p, on('a1', 's1'))).toBe(true);
      expect(can([adminSource], {}, p, on(null, null))).toBe(true);
    }
  });

  it('the admin\'s policies cannot be removed', () => {
    expect(can([adminSource], { 'people.disable': false }, 'people.disable', on('a1', 's1'))).toBe(true);
  });

  it('no source: no permission', () => {
    expect(can([], {}, 'events.manage', on('a1', 's1'))).toBe(false);
  });

  describe('staff', () => {
    const coachS1: Source = { role: 'coach', scope: team('s1') };

    it('coach: inside their own team yes', () => {
      expect(can([coachS1], {}, 'events.manage', on('a1', 's1'))).toBe(true);
    });
    it('coach: in another team, even of the same section, no', () => {
      expect(can([coachS1], {}, 'events.manage', on('a1', 's2'))).toBe(false);
    });
    it('coach: at club or section level no', () => {
      expect(can([coachS1], {}, 'people.manage', on(null, null))).toBe(false);
      expect(can([coachS1], {}, 'people.manage', on('a1', null))).toBe(false);
    });
    it('coach has neither people.disable nor certificates.file', () => {
      expect(can([coachS1], {}, 'people.disable', on('a1', 's1'))).toBe(false);
      expect(can([coachS1], {}, 'certificates.file', on('a1', 's1'))).toBe(false);
    });
    it('a diff grants a policy outside the template, only within the source\'s scope', () => {
      const diff = { 'certificates.file': true } as const;
      expect(can([coachS1], diff, 'certificates.file', on('a1', 's1'))).toBe(true);
      expect(can([coachS1], diff, 'certificates.file', on('a1', 's2'))).toBe(false);
    });
    it('a negative diff removes a template policy', () => {
      const diff = { 'events.manage': false } as const;
      expect(can([coachS1], diff, 'events.manage', on('a1', 's1'))).toBe(false);
      expect(can([coachS1], diff, 'attendances.record', on('a1', 's1'))).toBe(true);
    });
    it('trainer: attendances only', () => {
      const f: Source = { role: 'trainer', scope: team('s1') };
      expect(can([f], {}, 'attendances.record', on('a1', 's1'))).toBe(true);
      expect(can([f], {}, 'callups.manage', on('a1', 's1'))).toBe(false);
    });
  });

  describe('manager', () => {
    it('read-only by default: no policy', () => {
      const f: Source = { role: 'manager', scope: CLUB };
      for (const p of POLICY) expect(can([f], {}, p, on('a1', 's1'))).toBe(false);
    });
    it('with a diff acts within their own scope, never beyond', () => {
      const diff = { 'people.manage': true } as const;
      const dirSection: Source = { role: 'manager', scope: section('a1') };
      expect(can([dirSection], diff, 'people.manage', on('a1', 's1'))).toBe(true);
      expect(can([dirSection], diff, 'people.manage', on('a1', null))).toBe(true);
      expect(can([dirSection], diff, 'people.manage', on('a2', 's9'))).toBe(false);
      expect(can([dirSection], diff, 'people.manage', on(null, null))).toBe(false);

      const dirTeam: Source = { role: 'manager', scope: team('s1') };
      expect(can([dirTeam], diff, 'people.manage', on('a1', 's1'))).toBe(true);
      expect(can([dirTeam], diff, 'people.manage', on('a1', 's2'))).toBe(false);
      expect(can([dirTeam], diff, 'people.manage', on('a1', null))).toBe(false);
    });
    it('a team without a section is out of reach of every section manager', () => {
      const diff = { 'people.manage': true } as const;
      const dirSection: Source = { role: 'manager', scope: section('a1') };
      expect(can([dirSection], diff, 'people.manage', on(null, 's1'))).toBe(false);
      expect(sees([dirSection], on(null, 's1'))).toBe(false);
    });
    it('a team without a section is still reached by its own team scope and by the club scope', () => {
      const diff = { 'people.manage': true } as const;
      expect(can([{ role: 'manager', scope: team('s1') }], diff, 'people.manage', on(null, 's1'))).toBe(true);
      expect(can([{ role: 'manager', scope: CLUB }], diff, 'people.manage', on(null, 's1'))).toBe(true);
    });
    it('club manager with a diff acts anywhere, even at club level', () => {
      const f: Source = { role: 'manager', scope: CLUB };
      expect(can([f], { 'people.manage': true }, 'people.manage', on(null, null))).toBe(true);
      expect(can([f], { 'people.manage': true }, 'people.manage', on('a9', 's9'))).toBe(true);
    });
  });

  describe('multiple sources', () => {
    it('one source covering the target is enough', () => {
      const sources: Source[] = [
        { role: 'coach', scope: team('s1') },
        { role: 'trainer', scope: team('s2') },
      ];
      expect(can(sources, {}, 'events.manage', on('a1', 's1'))).toBe(true);
      expect(can(sources, {}, 'events.manage', on('a1', 's2'))).toBe(false);
      expect(can(sources, {}, 'attendances.record', on('a1', 's2'))).toBe(true);
    });
    it('the diff applies to every source of the membership', () => {
      const sources: Source[] = [
        { role: 'coach', scope: team('s1') },
        { role: 'manager', scope: section('a2') },
      ];
      const diff = { 'people.manage': true } as const;
      expect(can(sources, diff, 'people.manage', on('a2', 's7'))).toBe(true);
    });
    it('a negative diff removes the policy from all non-admin sources', () => {
      const sources: Source[] = [
        { role: 'coach', scope: team('s1') },
        { role: 'coach', scope: team('s2') },
      ];
      const diff = { 'events.manage': false } as const;
      expect(can(sources, diff, 'events.manage', on('a1', 's1'))).toBe(false);
      expect(can(sources, diff, 'events.manage', on('a1', 's2'))).toBe(false);
    });
    it('admin plus another source: admin prevails', () => {
      const sources: Source[] = [{ role: 'coach', scope: team('s1') }, adminSource];
      expect(can(sources, { 'people.disable': false }, 'people.disable', on('a5', 's5'))).toBe(true);
    });
  });
});

describe('computeDiff', () => {
  it('no difference from the template: empty diff', () => {
    expect(computeDiff('coach', templateDefault('coach'))).toEqual({});
  });
  it('records only grants and revocations relative to the template', () => {
    expect(computeDiff('trainer', ['attendances.record', 'events.manage'])).toEqual({ 'events.manage': true });
    expect(computeDiff('assistant_coach', ['attendances.record'])).toEqual({
      'callups.manage': false,
      'certificates.status': false,
    });
  });
  it('manager: everything desired is a grant', () => {
    expect(computeDiff('manager', ['people.manage'])).toEqual({ 'people.manage': true });
  });
  it('ignores unknown keys and duplicates', () => {
    expect(computeDiff('manager', ['people.manage', 'people.manage', 'boh' as never])).toEqual({
      'people.manage': true,
    });
  });
});

describe('default', () => {
  it('is the union of the role templates, without duplicates and in key order', () => {
    expect(defaultValue(['assistant_coach', 'trainer'])).toEqual(['callups.manage', 'attendances.record', 'certificates.status']);
    expect(defaultValue(['manager'])).toEqual([]);
    expect(defaultValue([])).toEqual([]);
  });
});

describe('effective', () => {
  it('without a diff they match the defaults', () => {
    expect(effective(['assistant_coach'], {})).toEqual(defaultValue(['assistant_coach']));
  });
  it('true grants, false revokes', () => {
    expect(effective(['manager'], { 'people.manage': true })).toEqual(['people.manage']);
    expect(effective(['trainer'], { 'attendances.record': false })).toEqual([]);
  });
  it('the admin always has everything, whatever the diff', () => {
    expect(effective(['admin'], { 'people.manage': false })).toEqual([...POLICY]);
  });
  it('with multiple roles one granting is enough; the diff applies to all roles', () => {
    expect(effective(['manager', 'trainer'], {})).toEqual(['attendances.record']);
    expect(effective(['manager', 'trainer'], { 'attendances.record': false })).toEqual([]);
  });
});

describe('validateDiff', () => {
  it('accepts a map of known keys with boolean values, even empty', () => {
    expect(validateDiff({})).toEqual({});
    expect(validateDiff({ 'people.manage': true, 'events.manage': false })).toEqual({
      'people.manage': true,
      'events.manage': false,
    });
  });
  it('rejects unknown keys, non-boolean values and non-object types', () => {
    expect(validateDiff({ boh: true })).toBeNull();
    expect(validateDiff({ 'people.manage': 'si' })).toBeNull();
    expect(validateDiff({ 'people.manage': null })).toBeNull();
    for (const v of [null, undefined, 'x', 3, true, [], [true]]) expect(validateDiff(v)).toBeNull();
  });
});
