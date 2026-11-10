import { AccessRoleType, ScopeType } from '../entities/enums';
import type { CtxRole } from '../common/auth-context';
import { EnrollmentType } from '../entities/enums';
import { canReadRoster, canReadSeasonEvents } from './visibility';

const season = { id: 's1', activityId: 'a1', teamId: 't1' };
const role = (r: Partial<CtxRole> & Pick<CtxRole, 'role' | 'scope'>): CtxRole => ({ activityId: null, teamId: null, ...r });

describe('canReadSeasonEvents', () => {
  it('admin and club manager read everything in the club', () => {
    expect(canReadSeasonEvents([role({ role: AccessRoleType.ADMIN, scope: ScopeType.CLUB })], [], season)).toBe(true);
    expect(canReadSeasonEvents([role({ role: AccessRoleType.MANAGER, scope: ScopeType.CLUB })], [], season)).toBe(true);
  });

  it('an activity manager reads only that activity', () => {
    const m = (activityId: string) => [role({ role: AccessRoleType.MANAGER, scope: ScopeType.ACTIVITY, activityId })];
    expect(canReadSeasonEvents(m('a1'), [], season)).toBe(true);
    expect(canReadSeasonEvents(m('a2'), [], season)).toBe(false);
  });

  it('a team manager reads only that team', () => {
    const m = (teamId: string) => [role({ role: AccessRoleType.MANAGER, scope: ScopeType.TEAM, teamId })];
    expect(canReadSeasonEvents(m('t1'), [], season)).toBe(true);
    expect(canReadSeasonEvents(m('t2'), [], season)).toBe(false);
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
