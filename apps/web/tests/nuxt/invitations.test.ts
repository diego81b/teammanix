import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { useInvitations } from '../../app/composables/useInvitations'
import { ApiError } from '../../app/composables/useApi'

let seen: { method: string, auth?: string } | null = null

const mine = [{ id: 'i1', club: 'ASD Prova', role: 'manager', scope: 'club', language: 'it', destination: null, recordName: null }]

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  seen = null
  useSessionStore().set({
    accessToken: 'tok',
    user: { id: 'u1', email: 'a@b.it', name: 'Ada', surname: 'Rossi', language: 'it' },
    activeClub: null,
    memberships: [],
  })
})

describe('useInvitations', () => {
  it('mine reads the open invitations of the account', async () => {
    registerEndpoint('/api/invitations/mine', {
      method: 'GET',
      handler: (event) => {
        seen = { method: event.method, auth: event.headers.get('authorization') ?? undefined }
        return mine
      },
    })
    expect(await useInvitations().mine()).toEqual(mine)
    expect(seen).toEqual({ method: 'GET', auth: 'Bearer tok' })
  })

  it('acceptMine posts by id and stores the session of the new club', async () => {
    const dto = {
      accessToken: 'new-tok',
      user: { id: 'u1', email: 'a@b.it', name: 'Ada', surname: 'Rossi', language: 'it' },
      activeClub: { id: 'c1', name: 'ASD Prova' },
      memberships: [],
    }
    registerEndpoint('/api/invitations/mine/i1/accept', {
      method: 'POST',
      handler: (event) => {
        seen = { method: event.method, auth: event.headers.get('authorization') ?? undefined }
        return dto
      },
    })
    await useInvitations().acceptMine('i1')
    expect(seen).toEqual({ method: 'POST', auth: 'Bearer tok' })
    expect(useSessionStore().token).toBe('new-tok')
  })

  it('acceptMine on a dead invitation returns INVALID_INVITATION and keeps the session', async () => {
    registerEndpoint('/api/invitations/mine/dead/accept', {
      method: 'POST',
      handler: () => new Response(JSON.stringify({ message: 'Invalid invitation', code: 'INVALID_INVITATION' }), { status: 404, headers: { 'content-type': 'application/json' } }),
    })
    const e = await useInvitations().acceptMine('dead').catch(x => x)
    expect(e).toBeInstanceOf(ApiError)
    expect([e.status, e.code]).toEqual([404, 'INVALID_INVITATION'])
    expect(useSessionStore().authenticated).toBe(true)
  })
})
