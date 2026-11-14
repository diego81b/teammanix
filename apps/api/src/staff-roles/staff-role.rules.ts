import { Language, StaffPolicyModel } from '../entities/enums';

/** Key for the uniqueness of a role name within a club: ignores case, accents and repeated spaces. */
export function nameKey(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** An archived role stays on the enrollments that have it but cannot be chosen for a new one. */
export function usableForNewEnrollment(role: { archivedAt: Date | null }): boolean {
  return role.archivedAt === null;
}

export interface DefaultStaffRole {
  name: string;
  policyModel: StaffPolicyModel;
  mustBeAvailable: boolean;
}

const roles = (names: [string, string, string, string, string]): DefaultStaffRole[] => [
  { name: names[0], policyModel: StaffPolicyModel.COACH, mustBeAvailable: true },
  { name: names[1], policyModel: StaffPolicyModel.ASSISTANT_COACH, mustBeAvailable: false },
  { name: names[2], policyModel: StaffPolicyModel.TRAINER, mustBeAvailable: false },
  { name: names[3], policyModel: StaffPolicyModel.NONE, mustBeAvailable: false },
  { name: names[4], policyModel: StaffPolicyModel.NONE, mustBeAvailable: false },
];

/**
 * The five roles a new club starts with, named in the language of its creator at that moment. They are data of
 * the club from then on: nothing translates them afterwards.
 */
export const DEFAULT_STAFF_ROLES: Record<Language, DefaultStaffRole[]> = {
  [Language.IT]: roles(['Allenatore', 'Vice allenatore', 'Preparatore', 'Accompagnatore', 'Altro']),
  [Language.EN]: roles(['Coach', 'Assistant coach', 'Trainer', 'Team official', 'Other']),
  [Language.FR]: roles(['Entraîneur', 'Entraîneur adjoint', 'Préparateur', 'Accompagnateur', 'Autre']),
};
