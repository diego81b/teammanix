import { AccessRoleType, ScopeType } from '../entities/enums';
import type { CtxRole } from '../common/auth-context';
import { EnrollmentType } from '../entities/enums';
import { canReadRoster, canReadSeasonEvents } from './visibility';

const season = { id: 's1', sectionId: 'sec-1', teamId: 't1' };
const role = (r: Partial<CtxRole> & Pick<CtxRole, 'role' | 'scope'>): CtxRole => ({ sectionId: null, teamId: null, ...r });

describe('canReadSeasonEvents', () => {
  it('admin and club manager read everything in the club', () => {
    expect(canReadSeasonEvents([role({ role: AccessRoleType.ADMIN, scope: ScopeType.CLUB })], [], season)).toBe(true);
    expect(canReadSeasonEvents([role({ role: AccessRoleType.MANAGER, scope: ScopeType.CLUB })], [], season)).toBe(true);
  });

  it('a section manager reads only that section', () => {
    const m = (sectionId: string) => [role({ role: AccessRoleType.MANAGER, scope: ScopeType.SECTION, sectionId })];
    expect(canReadSeasonEvents(m('sec-1'), [], season)).toBe(true);
    expect(canReadSeasonEvents(m('sec-2'), [], season)).toBe(false);
  });

  it('a section manager never reads a team without a section', () => {
    const noSection = { id: 's1', sectionId: null, teamId: 't1' };
    const m = [role({ role: AccessRoleType.MANAGER, scope: ScopeType.SECTION, sectionId: 'sec-1' })];
    expect(canReadSeasonEvents(m, [], noSection)).toBe(false);
    // A malformed role (section scope without section) does not match a team without section either.
    const broken = [role({ role: AccessRoleType.MANAGER, scope: ScopeType.SECTION, sectionId: null })];
    expect(canReadSeasonEvents(broken, [], noSection)).toBe(false);
  });

  it('a team manager reads only that team, with or without a section', () => {
    const m = (teamId: string) => [role({ role: AccessRoleType.MANAGER, scope: ScopeType.TEAM, teamId })];
    expect(canReadSeasonEvents(m('t1'), [], season)).toBe(true);
    expect(canReadSeasonEvents(m('t2'), [], season)).toBe(false);
    expect(canReadSeasonEvents(m('t1'), [], { id: 's1', sectionId: null, teamId: 't1' })).toBe(true);
  });

  it('a person reads the seasons they are enrolled in, past ones included, and no other', () => {
    expect(canReadSeasonEvents([], ['s1', 's0'], season)).toBe(true);
    expect(canReadSeasonEvents([], ['s0'], season)).toBe(false);
  });

  it('no role and no enrollment: nothing', () => {
    expect(canReadSeasonEvents([], [], season)).toBe(false);
  });
});

describe('canReadRoster', () => {
  const m = (teamId: string) => [role({ role: AccessRoleType.MANAGER, scope: ScopeType.TEAM, teamId })];

  it('the staff of the season read, a player of it does not', () => {
    expect(canReadRoster([], [EnrollmentType.STAFF], season)).toBe(true);
    expect(canReadRoster([], [EnrollmentType.PLAYER], season)).toBe(false);
    expect(canReadRoster([], [EnrollmentType.PLAYER, EnrollmentType.STAFF], season)).toBe(true);
  });

  it('admin and managers read within their scope, even when they play in the team', () => {
    expect(canReadRoster([role({ role: AccessRoleType.ADMIN, scope: ScopeType.CLUB })], [], season)).toBe(true);
    expect(canReadRoster(m('t1'), [], season)).toBe(true);
    expect(canReadRoster(m('t2'), [], season)).toBe(false);
    expect(canReadRoster(m('t1'), [EnrollmentType.PLAYER], season)).toBe(true);
  });

  it('no role and no enrollment: nothing', () => {
    expect(canReadRoster([], [], season)).toBe(false);
  });
});
