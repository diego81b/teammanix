import { StaffRole, EnrollmentType } from '../entities/enums';
import { allowedPosition, positionInherited, rolePolicyFrom, validateEnrollment } from './enrollment.rules';

const G = EnrollmentType.PLAYER;
const S = EnrollmentType.STAFF;

describe('validateEnrollment', () => {
  it('valid player, with optional position and jersey', () => {
    expect(validateEnrollment({ type: G })).toBeNull();
    expect(validateEnrollment({ type: G, position: 'goalkeeper', jerseyNumber: 1 })).toBeNull();
    expect(validateEnrollment({ type: G, jerseyNumber: 0 })).toBeNull();
    expect(validateEnrollment({ type: G, jerseyNumber: 999 })).toBeNull();
  });

  it('valid staff requires the staff role', () => {
    expect(validateEnrollment({ type: S, staffRole: StaffRole.COACH })).toBeNull();
    expect(validateEnrollment({ type: S })).toBe('STAFF_ROLE_REQUIRED');
  });

  it('the staff role is not valid for a player', () => {
    expect(validateEnrollment({ type: G, staffRole: StaffRole.COACH })).toBe('STAFF_ROLE_NOT_ALLOWED');
  });

  it('jersey and position apply only to a player', () => {
    expect(validateEnrollment({ type: S, staffRole: StaffRole.OTHER, jerseyNumber: 7 })).toBe('PLAYER_DATA_NOT_ALLOWED');
    expect(validateEnrollment({ type: S, staffRole: StaffRole.OTHER, position: 'libero' })).toBe('PLAYER_DATA_NOT_ALLOWED');
  });

  it('jersey number is an integer between 0 and 999', () => {
    for (const n of [-1, 1000, 1.5, Number.NaN]) expect(validateEnrollment({ type: G, jerseyNumber: n })).toBe('INVALID_NUMBER_JERSEY');
  });
});

describe('allowedPosition', () => {
  const football = ['goalkeeper', 'defender'];
  it('no position is always valid', () => {
    expect(allowedPosition(null, football)).toBe(true);
    expect(allowedPosition(undefined, [])).toBe(true);
  });
  it('only a profile code is valid', () => {
    expect(allowedPosition('goalkeeper', football)).toBe(true);
    expect(allowedPosition('Goalkeeper', football)).toBe(false);
    expect(allowedPosition('libero', football)).toBe(false);
  });
  it('a profile without positions rejects all of them', () => {
    expect(allowedPosition('goalkeeper', [])).toBe(false);
  });
});

describe('positionInherited', () => {
  it('kept if the destination has it, otherwise lost', () => {
    expect(positionInherited('goalkeeper', ['goalkeeper', 'pivot'])).toBe('goalkeeper');
    expect(positionInherited('goalkeeper', ['setter'])).toBeNull();
    expect(positionInherited('goalkeeper', [])).toBeNull();
    expect(positionInherited(null, ['goalkeeper'])).toBeNull();
  });
});

describe('rolePolicyFrom', () => {
  it('a player is a player', () => {
    expect(rolePolicyFrom({ type: G, staffRole: null })).toBe('player');
  });
  it('staff carries its own role', () => {
    for (const r of Object.values(StaffRole)) expect(rolePolicyFrom({ type: S, staffRole: r })).toBe(r);
  });
  it('staff without a role: inconsistent data, role without permissions', () => {
    expect(rolePolicyFrom({ type: S, staffRole: null })).toBe('other');
  });
});
