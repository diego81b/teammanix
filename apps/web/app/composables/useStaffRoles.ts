import type { StaffRoleItem } from '../types/api'
import { roleChoices, type RoleFields } from '../utils/staff-role'

/** The club's catalog of staff roles: any member reads it, only the admin changes it. */
export function useStaffRoles() {
  const api = useApi()
  return {
    list: () => api<StaffRoleItem[]>('/staff-roles'),
    create: (data: RoleFields) => api<StaffRoleItem>('/staff-roles', { method: 'POST', body: { ...data } }),
    edit: (id: string, data: Partial<RoleFields> & { archived?: boolean }) =>
      api<StaffRoleItem>(`/staff-roles/${id}`, { method: 'PATCH', body: { ...data } }),
    /** Only a role no enrollment uses (STAFF_ROLE_IN_USE otherwise): the others are archived. */
    remove: (id: string) => api<void>(`/staff-roles/${id}`, { method: 'DELETE' }),
  }
}

/** Catalog for the forms that pick a role: loaded when the dialog opens, offering the active roles and the one already held. */
export function useStaffRoleChoices() {
  const { t } = useI18n()
  const catalog = useStaffRoles()
  const roles = ref<StaffRoleItem[]>([])
  const error = ref('')

  async function load() {
    try {
      roles.value = await catalog.list()
      error.value = ''
    }
    catch (e) {
      error.value = errorText(e)
    }
  }

  const choices = (currentId?: string | null) => roleChoices(roles.value, currentId, t('staffRoles.archived'))

  return { roles, error, load, choices }
}
