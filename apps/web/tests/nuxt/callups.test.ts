import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { useCallups } from '../../app/composables/useCallups'

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  const s = useSessionStore()
  s.clear()
  s.token = 'tok'
})

interface Call { method: string, body?: unknown }
const last: Record<string, Call> = {}

function endpoint(path: string, response: unknown = {}, status = 200) {
  registerEndpoint(`/api${path}`, {
    method: undefined as never,
    handler: async (event) => {
      const method = event.method
      last[`${method} ${path}`] = { method, body: ['GET', 'DELETE'].includes(method) ? undefined : await readBody(event).catch(() => undefined) }
      return status === 204 ? new Response(null, { status }) : response
    },
  })
}

describe('useCallups', () => {
  it('reads the lists of an event', async () => {
    endpoint('/events/e1/callups', { view: 'manage', calledUp: [], callable: [], notCallable: [] })
    expect(await useCallups().lists('e1')).toMatchObject({ view: 'manage' })
  })

  it('calls up with and without the confirmation', async () => {
    endpoint('/events/e1/callups', { enrollmentId: 'i1' })
    const c = useCallups()
    await c.add('e1', 'i1')
    expect(last['POST /events/e1/callups']?.body).toEqual({ enrollmentId: 'i1' })
    await c.add('e1', 'i2', true)
    expect(last['POST /events/e1/callups']?.body).toEqual({ enrollmentId: 'i2', confirm: true })
  })

  it('removes, marks and sends with the right paths', async () => {
    endpoint('/events/e1/callups/i1', { enrollmentId: 'i1', placement: 'starter' })
    endpoint('/events/e1/callups/send', { notified: [{ enrollmentId: 'i1', personId: 'p1' }] })
    const c = useCallups()
    await c.remove('e1', 'i1')
    expect(last['DELETE /events/e1/callups/i1']?.method).toBe('DELETE')
    await c.placement('e1', 'i1', 'starter')
    expect(last['PATCH /events/e1/callups/i1']?.body).toEqual({ placement: 'starter' })
    await c.placement('e1', 'i1', null)
    expect(last['PATCH /events/e1/callups/i1']?.body).toEqual({ placement: null })
    expect(await c.send('e1')).toEqual({ notified: [{ enrollmentId: 'i1', personId: 'p1' }] })
    expect(last['POST /events/e1/callups/send']?.method).toBe('POST')
  })
  it('answers a call-up: a confirmation without reason, a decline with one', async () => {
    endpoint('/events/e1/callups/me', { enrollmentId: 'i1', response: 'confirmed', reason: null, responseAt: null })
    const c = useCallups()
    await c.answer('e1', 'confirmed')
    expect(last['PUT /events/e1/callups/me']).toEqual({ method: 'PUT', body: { response: 'confirmed' } })
    await c.answer('e1', 'declined', 'work')
    expect(last['PUT /events/e1/callups/me']?.body).toEqual({ response: 'declined', reason: 'work' })
  })

  it('declares the availability of the staff member, with no reason', async () => {
    endpoint('/events/e1/availability/me', { enrollmentId: 's1', response: 'declined', reason: null, responseAt: null })
    await useCallups().availability('e1', 'declined')
    expect(last['PUT /events/e1/availability/me']).toEqual({ method: 'PUT', body: { response: 'declined' } })
  })

  it('reads the trail of the answers of a person', async () => {
    endpoint('/events/e1/callups/i1/history', { changes: [{ from: 'pending', fromReason: null, to: 'confirmed', reason: null, changedAt: '2026-11-12T18:40:00.000Z' }] })
    expect((await useCallups().history('e1', 'i1')).changes).toHaveLength(1)
  })
})
