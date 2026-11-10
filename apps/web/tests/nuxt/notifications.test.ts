import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { useNotifications } from '../../app/composables/useNotifications'
import { ApiError } from '../../app/composables/useApi'

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  const s = useSessionStore()
  s.clear()
  s.token = 'tok'
})

interface Call { method: string, body?: unknown, auth?: string }
const last: Record<string, Call> = {}

function endpoint(path: string, response: unknown = {}, status = 200) {
  registerEndpoint(`/api${path}`, {
    method: undefined as never,
    handler: async (event) => {
      const method = event.method
      last[`${method} ${path}`] = {
        method,
        auth: event.headers.get('authorization') ?? undefined,
        body: ['GET', 'DELETE'].includes(method) && !event.headers.get('content-type') ? undefined : await readBody(event).catch(() => undefined),
      }
      return status === 204 ? new Response(null, { status }) : status >= 400 ? new Response(JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } }) : response
    },
  })
}

describe('useNotifications', () => {
  it('reads the center with the unread count, as the account', async () => {
    endpoint('/notifications', { items: [{ id: 'n1', type: 'callup' }], unread: 1 })
    expect(await useNotifications().list()).toEqual({ items: [{ id: 'n1', type: 'callup' }], unread: 1 })
    expect(last['GET /notifications']?.auth).toBe('Bearer tok')
  })

  it('marks one or all as read', async () => {
    endpoint('/notifications/n1/read', {}, 204)
    endpoint('/notifications/read-all', {}, 204)
    const n = useNotifications()
    await n.markRead('n1')
    await n.markAllRead()
    expect(last['POST /notifications/n1/read']).toBeDefined()
    expect(last['POST /notifications/read-all']).toBeDefined()
  })

  it('reads the channels of every club and saves them for one', async () => {
    endpoint('/notifications/preferences', [{ clubId: 'c1', name: 'A', inApp: true, email: true, push: true }])
    endpoint('/notifications/preferences/c1', { clubId: 'c1', name: 'A', inApp: true, email: false, push: true })
    const n = useNotifications()
    expect(await n.preferences()).toHaveLength(1)
    await n.savePreference('c1', { inApp: true, email: false, push: true })
    expect(last['PUT /notifications/preferences/c1']?.body).toEqual({ inApp: true, email: false, push: true })
  })

  it('registers and removes a device', async () => {
    endpoint('/notifications/push/subscription', {}, 204)
    const n = useNotifications()
    await n.pushSubscribe({ endpoint: 'https://push.test/1', keys: { p256dh: 'a', auth: 'b' } })
    expect(last['PUT /notifications/push/subscription']?.body).toEqual({ endpoint: 'https://push.test/1', keys: { p256dh: 'a', auth: 'b' } })
    await n.pushUnsubscribe('https://push.test/1')
    expect(last['DELETE /notifications/push/subscription']?.body).toEqual({ endpoint: 'https://push.test/1' })
  })

  it('push not configured arrives as an error with its code', async () => {
    endpoint('/notifications/push/key', { message: 'x', code: 'PUSH_NOT_CONFIGURED' }, 404)
    const error = await useNotifications().pushKey().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect([(error as ApiError).status, (error as ApiError).code]).toEqual([404, 'PUSH_NOT_CONFIGURED'])
  })
})

describe('notifications store', () => {
  it('keeps the unread count of the active club for the bell', async () => {
    endpoint('/notifications', { items: [], unread: 4 })
    const store = useNotificationsStore()
    await store.refresh()
    expect(store.unread).toBe(4)
  })

  it('does not ask without a session, and clears the count', async () => {
    const store = useNotificationsStore()
    store.unread = 3
    useSessionStore().clear()
    await store.refresh()
    expect(store.unread).toBe(0)
  })

  it('a failed refresh keeps the last count: a network blip must not hide what is unread', async () => {
    endpoint('/notifications', { message: 'x' }, 500)
    const store = useNotificationsStore()
    store.unread = 2
    await store.refresh()
    expect(store.unread).toBe(2)
  })

  it('follows what the page does: read one, read all', () => {
    const store = useNotificationsStore()
    store.unread = 3
    store.dropOne()
    expect(store.unread).toBe(2)
    store.unread = 0
    store.dropOne()
    expect(store.unread).toBe(0)
    store.unread = 5
    store.set(0)
    expect(store.unread).toBe(0)
  })
})
