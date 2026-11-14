import type { DiffPolicy, InvitationDto, Language, PermissionDto, RoleDto, InvitationRole, ScopeType } from '../types/api'

export interface InvitationData {
  email: string
  role: InvitationRole
  language?: Language
  scope?: ScopeType
  sectionId?: string
  teamId?: string
  personId?: string
  name?: string
}

/** Invitations, access roles and permissions (screens 29 and 36). Admin only. */
export function useAccess() {
  const api = useApi()
  return {
    invitations: () => api<InvitationDto[]>('/invitations'),
    invite: (data: InvitationData) => api<InvitationDto>('/invitations', { method: 'POST', body: { ...data } }),
    resend: (id: string) => api<InvitationDto>(`/invitations/${id}/resend`, { method: 'POST', body: {} }),
    revoke: (id: string) => api<void>(`/invitations/${id}`, { method: 'DELETE' }),
    roles: () => api<RoleDto[]>('/roles'),
    removeRole: (id: string) => api<void>(`/roles/${id}`, { method: 'DELETE' }),
    permissions: () => api<PermissionDto[]>('/permissions'),
    setPermissions: (userId: string, diff: DiffPolicy) =>
      api<PermissionDto>(`/permissions/${userId}`, { method: 'PUT', body: { diff } }),
  }
}
