import { AccessRoleType, StaffPolicyModel, ScopeType } from '../entities/enums';
import { targetFromTeam, sourcesFrom, type EnrollmentStaffCtx } from './sources';
import { can } from './policy';

const ADMIN = { role: AccessRoleType.ADMIN, scope: ScopeType.CLUB, sectionId: null, teamId: null };
const managerClub = { role: AccessRoleType.MANAGER, scope: ScopeType.CLUB, sectionId: null, teamId: null };
const managerSection = { role: AccessRoleType.MANAGER, scope: ScopeType.SECTION, sectionId: 'sec-1', teamId: null };
const managerTeam = { role: AccessRoleType.MANAGER, scope: ScopeType.TEAM, sectionId: null, teamId: 'sq-1' };
const staff = (policyModel: StaffPolicyModel | null, teamId = 'sq-1'): EnrollmentStaffCtx => ({ policyModel, teamId });

describe('sourcesFrom', () => {
  it('admin and manager carry their scope', () => {
    expect(sourcesFrom([ADMIN, managerClub], [])).toEqual([
      { role: 'admin', scope: { type: 'club' } },
      { role: 'manager', scope: { type: 'club' } },
    ]);
    expect(sourcesFrom([managerSection], [])).toEqual([{ role: 'manager', scope: { type: 'section', sectionId: 'sec-1' } }]);
    expect(sourcesFrom([managerTeam], [])).toEqual([{ role: 'manager', scope: { type: 'team', teamId: 'sq-1' } }]);
  });

  it('staff always has team scope and the permission model of the role; without a role it is none', () => {
    expect(sourcesFrom([], [staff(StaffPolicyModel.COACH), staff(null, 'sq-2')])).toEqual([
      { role: 'coach', scope: { type: 'team', teamId: 'sq-1' } },
      { role: 'none', scope: { type: 'team', teamId: 'sq-2' } },
    ]);
  });

  it('without roles or staff enrollments there are no sources', () => {
    expect(sourcesFrom([], [])).toEqual([]);
  });

  it('a role whose scope target is missing yields no source (fail closed)', () => {
    const noSection = { role: AccessRoleType.MANAGER, scope: ScopeType.SECTION, sectionId: null, teamId: null };
    const noTeam = { role: AccessRoleType.MANAGER, scope: ScopeType.TEAM, sectionId: null, teamId: null };
    expect(sourcesFrom([noSection, noTeam], [])).toEqual([]);
  });
});

describe('sources and policy by scope, from real sources', () => {
  const on = (teamId: string, sectionId: string | null = 'sec-1') => targetFromTeam(sectionId, teamId);

  it('the coach manages events only in their own team', () => {
    const f = sourcesFrom([], [staff(StaffPolicyModel.COACH)]);
    expect(can(f, {}, 'events.manage', on('sq-1'))).toBe(true);
    expect(can(f, {}, 'events.manage', on('sq-2'))).toBe(false);
    expect(can(f, {}, 'events.manage', on('sq-3', 'sec-2'))).toBe(false);
  });

  it('the coach manages their team whether it has a section or not', () => {
    const f = sourcesFrom([], [staff(StaffPolicyModel.COACH)]);
    expect(can(f, {}, 'events.manage', on('sq-1', null))).toBe(true);
  });

  it('the coach does not act at club or section level', () => {
    const f = sourcesFrom([], [staff(StaffPolicyModel.COACH)]);
    expect(can(f, {}, 'events.manage', { sectionId: null, teamId: null })).toBe(false);
    expect(can(f, {}, 'events.manage', { sectionId: 'sec-1', teamId: null })).toBe(false);
  });

  it('a manager without granted policies can do nothing, with the policy only within their scope', () => {
    const f = sourcesFrom([managerSection], []);
    expect(can(f, {}, 'events.manage', on('sq-1'))).toBe(false);
    expect(can(f, { 'events.manage': true }, 'events.manage', on('sq-1'))).toBe(true);
    expect(can(f, { 'events.manage': true }, 'events.manage', on('sq-9', 'sec-2'))).toBe(false);
  });

  it('a section manager never reaches a team without a section', () => {
    const f = sourcesFrom([managerSection], []);
    expect(can(f, { 'events.manage': true }, 'events.manage', on('sq-9', null))).toBe(false);
  });

  it('the diff also revokes from the coach', () => {
    const f = sourcesFrom([], [staff(StaffPolicyModel.COACH)]);
    expect(can(f, { 'events.manage': false }, 'events.manage', on('sq-1'))).toBe(false);
  });

  it('someone with only the player role has no sources and can do nothing', () => {
    expect(can(sourcesFrom([], []), { 'events.manage': true }, 'events.manage', on('sq-1'))).toBe(false);
  });

  it('the admin can do anything anywhere, even with a diff that tries to revoke', () => {
    const f = sourcesFrom([ADMIN], []);
    expect(can(f, { 'events.manage': false }, 'events.manage', on('sq-1'))).toBe(true);
    expect(can(f, {}, 'people.disable', { sectionId: null, teamId: null })).toBe(true);
  });
});
