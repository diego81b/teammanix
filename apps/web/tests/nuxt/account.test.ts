import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { useAccount } from '../../app/composables/useAccount'
import { ApiError } from '../../app/composables/useApi'

const navigateToMock = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navigateToMock)

let seen: { auth?: string, body?: unknown } | null = null

function endpoint(response: unknown, status: number) {
  registerEndpoint('/api/auth/delete-account', {
    method: 'POST',
    handler: async (event) => {
      seen = { auth: event.headers.get('authorization') ?? undefined, body: await readBody(event).catch(() => undefined) }
      return status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } })
    },
  })
}

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  navigateToMock.mockReset()
  seen = null
  const s = useSessionStore()
  s.set({
    accessToken: 'tok',
    user: { id: 'u1', email: 'a@b.it', name: 'Ada', surname: 'Rossi', language: 'it' },
    activeClub: null,
    memberships: [],
  })
})

describe('useAccount.deleteAccount', () => {
  it('sends the password as the account and clears the session once the account is gone', async () => {
    endpoint(null, 204)
    await useAccount().deleteAccount('password-long-123')
    expect(seen).toEqual({ auth: 'Bearer tok', body: { password: 'password-long-123' } })
    const s = useSessionStore()
    expect(s.authenticated).toBe(false)
    expect(localStorage.getItem('tm-session')).toBeNull()
  })

  it('a wrong password is not an expired session: the error comes back and the session stays', async () => {
    endpoint({ message: 'Current password is wrong', code: 'PASSWORD_CURRENT_WRONG' }, 401)
    const e = await useAccount().deleteAccount('nope').catch(x => x)
    expect(e).toBeInstanceOf(ApiError)
    expect([e.status, e.code]).toEqual([401, 'PASSWORD_CURRENT_WRONG'])
    expect(useSessionStore().authenticated).toBe(true)
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('the last admin: the error comes back and the session stays', async () => {
    endpoint({ message: 'last admin', code: 'LAST_ADMIN' }, 409)
    const e = await useAccount().deleteAccount('password-long-123').catch(x => x)
    expect([e.status, e.code]).toEqual([409, 'LAST_ADMIN'])
    expect(useSessionStore().authenticated).toBe(true)
  })
})
