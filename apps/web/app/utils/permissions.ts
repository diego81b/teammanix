import type { PolicyKey, DiffPolicy, PermissionDto } from '../types/api'

/** Groups of screen 36, in the order of the specification. `chiave` is used to translate the label. */
export const POLICY_GROUPS: readonly { key: string, policy: readonly PolicyKey[] }[] = [
  { key: 'events', policy: ['events.manage'] },
  { key: 'callups', policy: ['callups.manage'] },
  { key: 'attendances', policy: ['attendances.record'] },
  { key: 'suspensions', policy: ['suspensions.manage'] },
  { key: 'people', policy: ['people.manage', 'people.disable'] },
  { key: 'certificates', policy: ['certificates.status', 'certificates.file'] },
]

export function togglePolicy(current: readonly PolicyKey[], key: PolicyKey): PolicyKey[] {
  return current.includes(key) ? current.filter((p) => p !== key) : [...current, key]
}

/** From the desired policies to only the differences from the defaults (the same rule as the API, which recomputes it). */
export function computeDiff(defaultValue: readonly PolicyKey[], wanted: readonly PolicyKey[]): DiffPolicy {
  const diff: DiffPolicy = {}
  for (const p of wanted) if (!defaultValue.includes(p)) diff[p] = true
  for (const p of defaultValue) if (!wanted.includes(p)) diff[p] = false
  return diff
}

export const custom = (p: Pick<PermissionDto, 'diff'>): boolean => Object.keys(p.diff).length > 0
