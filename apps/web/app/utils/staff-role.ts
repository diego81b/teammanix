import type { StaffPolicyModel, StaffRoleItem } from '../types/api'

/** Permission models a club role can use (rule 14), `none` last. */
export const POLICY_MODELS: readonly StaffPolicyModel[] = ['coach', 'assistant_coach', 'trainer', 'none']

export const NAME_MAX = 60

/** The API trims the name and wants 1 to 60 characters. */
export function validRoleName(name: string): boolean {
  const n = name.trim().length
  return n >= 1 && n <= NAME_MAX
}

/**
 * Items for a role select: the active roles, plus the archived one the enrollment already has, marked, so an
 * edit that does not touch the role can keep it. An archived role is never offered to anyone else.
 */
export function roleChoices(roles: readonly StaffRoleItem[], currentId: string | null | undefined, archivedLabel: string): { label: string, value: string }[] {
  return roles
    .filter(r => !r.archived || r.id === currentId)
    .map(r => ({ label: r.archived ? `${r.name} (${archivedLabel})` : r.name, value: r.id }))
}

/** Role a form starts with: the current one, else the first active, else empty (nothing to choose yet). */
export function startingRole(roles: readonly StaffRoleItem[], currentId: string | null | undefined): string {
  if (currentId && roles.some(r => r.id === currentId)) return currentId
  return roles.find(r => !r.archived)?.id ?? ''
}

export interface RoleFields {
  name: string
  policyModel: StaffPolicyModel
  mustBeAvailable: boolean
}

/** Body of `POST /staff-roles`: the name goes trimmed. */
export function roleCreateBody(f: RoleFields): RoleFields {
  return { name: f.name.trim(), policyModel: f.policyModel, mustBeAvailable: f.mustBeAvailable }
}

/** Body of `PATCH /staff-roles/:id`: only the fields that differ from the stored role (empty when nothing changed). */
export function roleEditBody(f: RoleFields, current: StaffRoleItem): Partial<RoleFields> {
  const body: Partial<RoleFields> = {}
  const name = f.name.trim()
  if (name !== current.name) body.name = name
  if (f.policyModel !== current.policyModel) body.policyModel = f.policyModel
  if (f.mustBeAvailable !== current.mustBeAvailable) body.mustBeAvailable = f.mustBeAvailable
  return body
}
