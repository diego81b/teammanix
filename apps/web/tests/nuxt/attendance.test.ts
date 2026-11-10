import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { useAttendance } from '../../app/composables/useAttendance'

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

describe('useAttendance', () => {
  it('reads the attendance of the event', async () => {
    endpoint('/events/e1/attendance', { view: 'stats', summary: { total: 0 } })
    expect(await useAttendance().view('e1')).toEqual({ view: 'stats', summary: { total: 0 } })
  })

  it('records an outcome on the enrollment with a PUT that carries the outcome only', async () => {
    endpoint('/events/e1/attendance/i1', { enrollmentId: 'i1', outcome: 'late' })
    const r = await useAttendance().record('e1', 'i1', 'late')
    expect(r).toEqual({ enrollmentId: 'i1', outcome: 'late' })
    expect(last['PUT /events/e1/attendance/i1']?.body).toEqual({ outcome: 'late' })
  })

  it('clears the outcome with a DELETE', async () => {
    endpoint('/events/e1/attendance/i2', undefined, 204)
    await useAttendance().clear('e1', 'i2')
    expect(last['DELETE /events/e1/attendance/i2']?.method).toBe('DELETE')
  })
})
