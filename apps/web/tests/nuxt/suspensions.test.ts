import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { useSuspensions } from '../../app/composables/useSuspensions'

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

describe('useSuspensions', () => {
  it('reads the own suspensions and the ones of a season', async () => {
    endpoint('/suspensions/me', [{ enrollmentId: 'i1', suspensions: [] }])
    endpoint('/seasons/s1/suspensions', [{ id: 'x1' }])
    const s = useSuspensions()
    expect(await s.mine()).toEqual([{ enrollmentId: 'i1', suspensions: [] }])
    expect(await s.ofSeason('s1')).toEqual([{ id: 'x1' }])
  })

  it('reads the suspensions of one enrollment', async () => {
    endpoint('/enrollments/i1/suspensions', { suspensions: [{ id: 'x1' }] })
    expect(await useSuspensions().ofEnrollment('i1')).toEqual([{ id: 'x1' }])
  })

  it('reads the context of the team screen', async () => {
    endpoint('/seasons/s1/suspensions-context', { canManage: true, people: [] })
    expect(await useSuspensions().context('s1')).toEqual({ canManage: true, people: [] })
  })

  it('creates on the enrollment with the body as given, origin included', async () => {
    endpoint('/enrollments/i1/suspensions', { id: 'x1' })
    await useSuspensions().create('i1', { form: 'matches', startDate: '2026-11-10', matchCount: 2, competitions: [], originEventId: 'e1' })
    expect(last['POST /enrollments/i1/suspensions']?.body).toEqual({ form: 'matches', startDate: '2026-11-10', matchCount: 2, competitions: [], originEventId: 'e1' })
  })

  it('changes and cancels with the right paths', async () => {
    endpoint('/suspensions/x1', { id: 'x1' })
    const s = useSuspensions()
    await s.update('x1', { form: 'period', startDate: '2026-11-10', endDate: '2026-11-20' })
    expect(last['PATCH /suspensions/x1']?.body).toEqual({ form: 'period', startDate: '2026-11-10', endDate: '2026-11-20' })
    await s.cancel('x1')
    expect(last['DELETE /suspensions/x1']).toBeDefined()
  })
})
