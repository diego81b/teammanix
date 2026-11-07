import type { RoleDto } from '../types/api'

type Item = Pick<RoleDto, 'id' | 'role'>

/** The API blocks removal of the last admin (ULTIMO_ADMIN): the UI disables it and explains why. */
export const lastAdmin = (r: Item, all: readonly Item[]): boolean =>
  r.role === 'admin' && all.filter(x => x.role === 'admin').length <= 1
