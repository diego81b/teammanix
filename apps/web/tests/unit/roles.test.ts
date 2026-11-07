import { describe, expect, it } from 'vitest'
import { lastAdmin } from '../../app/utils/roles'

const r = (id: string, role: string) => ({ id, role }) as { id: string, role: 'admin' | 'manager' }

describe('lastAdmin', () => {
  it('sole admin: true', () => expect(lastAdmin(r('1', 'admin'), [r('1', 'admin'), r('2', 'manager')])).toBe(true))
  it('two admins: false', () => expect(lastAdmin(r('1', 'admin'), [r('1', 'admin'), r('2', 'admin')])).toBe(false))
  it('a manager is never the last admin', () => expect(lastAdmin(r('2', 'manager'), [r('1', 'admin'), r('2', 'manager')])).toBe(false))
})
