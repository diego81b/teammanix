/**
 * Permission model (ANALISI rule 14). Pure functions, no dependencies on DB or Nest.
 * Each role has a default model; a person's membership carries only the differences (diff).
 */

export const POLICY = [
  'events.manage',
  'callups.manage',
  'attendances.record',
  'suspensions.manage',
  'people.manage',
  'people.disable',
  'certificates.status',
  'certificates.file',
] as const;

export type PolicyKey = (typeof POLICY)[number];

export type RolePolicy =
  | 'admin'
  | 'manager'
  | 'coach'
  | 'assistant_coach'
  | 'trainer'
  | 'none'
  | 'player';

export type PolicyScope =
  | { type: 'club' }
  | { type: 'section'; sectionId: string }
  | { type: 'team'; teamId: string };

/** A role exercised in a scope: a membership has one or more. */
export interface Source {
  role: RolePolicy;
  scope: PolicyScope;
}

/**
 * Where the action falls: null means the top level (club if both are null). A team may have no section: its
 * sectionId is null and no section scope covers it.
 */
export interface Target {
  sectionId: string | null;
  teamId: string | null;
}

/** Differences from the model: true grants, false revokes. */
export type DiffPolicy = Partial<Record<PolicyKey, boolean>>;

const TEMPLATES: Record<RolePolicy, readonly PolicyKey[]> = {
  admin: POLICY,
  coach: POLICY.filter((p) => p !== 'people.disable' && p !== 'certificates.file'),
  assistant_coach: ['callups.manage', 'attendances.record', 'certificates.status'],
  trainer: ['attendances.record'],
  manager: [],
  player: [],
  none: [],
};

export function templateDefault(role: RolePolicy): PolicyKey[] {
  return [...TEMPLATES[role]];
}

export function ePolicyKey(value: unknown): value is PolicyKey {
  return typeof value === 'string' && (POLICY as readonly string[]).includes(value);
}

export function covers(scope: PolicyScope, target: Target): boolean {
  switch (scope.type) {
    case 'club':
      return true;
    case 'section':
      return target.sectionId !== null && target.sectionId === scope.sectionId;
    case 'team':
      return target.teamId === scope.teamId;
  }
}

/** True if any role of the person has the target in its scope, whatever the policy. The admin sees the whole club. */
export function sees(sources: readonly Source[], target: Target): boolean {
  return sources.some((f) => covers(f.scope, target));
}

export function can(sources: readonly Source[], diff: DiffPolicy, policy: PolicyKey, target: Target): boolean {
  return sources.some((f) => {
    if (!covers(f.scope, target)) return false;
    // The admin's policies cannot be removed.
    if (f.role === 'admin') return true;
    const d = diff[policy];
    if (d !== undefined) return d;
    return TEMPLATES[f.role].includes(policy);
  });
}

/** From the desired policies to only the differences from the role model. */
export function computeDiff(role: RolePolicy, wanted: readonly PolicyKey[]): DiffPolicy {
  const template = new Set<PolicyKey>(TEMPLATES[role]);
  const requests = new Set(wanted.filter(ePolicyKey));
  const diff: DiffPolicy = {};
  for (const p of POLICY) {
    if (requests.has(p) && !template.has(p)) diff[p] = true;
    if (!requests.has(p) && template.has(p)) diff[p] = false;
  }
  return diff;
}

/** Union of the roles' default models, in key order. */
export function defaultValue(roles: readonly RolePolicy[]): PolicyKey[] {
  return POLICY.filter((p) => roles.some((r) => TEMPLATES[r].includes(p)));
}

/** Policies the person has across all their roles, ignoring scope. The admin always has them all. */
export function effective(roles: readonly RolePolicy[], diff: DiffPolicy): PolicyKey[] {
  return POLICY.filter((p) => roles.some((r) => r === 'admin' || (diff[p] ?? TEMPLATES[r].includes(p))));
}

/** A key and boolean value map with only known keys, or null. The value is already of the DiffPolicy shape. */
export function validateDiff(value: unknown): DiffPolicy | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const diff: DiffPolicy = {};
  for (const [k, v] of Object.entries(value)) {
    if (!ePolicyKey(k) || typeof v !== 'boolean') return null;
    diff[k] = v;
  }
  return diff;
}
