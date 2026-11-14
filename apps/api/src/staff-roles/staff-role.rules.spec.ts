import { Language, StaffPolicyModel } from '../entities/enums';
import { DEFAULT_STAFF_ROLES, nameKey, usableForNewEnrollment } from './staff-role.rules';

describe('nameKey', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(nameKey('Entraîneur')).toBe('entraineur');
    expect(nameKey('  Vice   Allenatore ')).toBe('vice allenatore');
    expect(nameKey('MAESTRO')).toBe(nameKey('maestro'));
    expect(nameKey('Prépàrateur')).toBe(nameKey('preparateur'));
  });

  it('different names keep different keys', () => {
    expect(nameKey('Maestro')).not.toBe(nameKey('Maestra'));
  });
});

describe('usableForNewEnrollment', () => {
  it('an archived role cannot be chosen', () => {
    expect(usableForNewEnrollment({ archivedAt: null })).toBe(true);
    expect(usableForNewEnrollment({ archivedAt: new Date() })).toBe(false);
  });
});

describe('DEFAULT_STAFF_ROLES', () => {
  it('every language has the same five roles with the same models', () => {
    const models = (l: Language) => DEFAULT_STAFF_ROLES[l].map((r) => [r.policyModel, r.mustBeAvailable]);
    expect(models(Language.IT)).toEqual([
      [StaffPolicyModel.COACH, true],
      [StaffPolicyModel.ASSISTANT_COACH, false],
      [StaffPolicyModel.TRAINER, false],
      [StaffPolicyModel.NONE, false],
      [StaffPolicyModel.NONE, false],
    ]);
    expect(models(Language.EN)).toEqual(models(Language.IT));
    expect(models(Language.FR)).toEqual(models(Language.IT));
  });

  it('names are in the language of the creator and unique within it', () => {
    expect(DEFAULT_STAFF_ROLES[Language.IT].map((r) => r.name)).toEqual(['Allenatore', 'Vice allenatore', 'Preparatore', 'Accompagnatore', 'Altro']);
    for (const l of Object.values(Language)) {
      const keys = DEFAULT_STAFF_ROLES[l].map((r) => nameKey(r.name));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
