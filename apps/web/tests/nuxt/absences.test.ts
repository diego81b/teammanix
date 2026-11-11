import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { useAbsences } from '../../app/composables/useAbsences'

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

describe('useAbsences', () => {
  it('reads the own enrollments with their absences', async () => {
    endpoint('/absences/me', [{ enrollmentId: 'i1', absences: [] }])
    expect(await useAbsences().mine()).toEqual([{ enrollmentId: 'i1', absences: [] }])
  })

  it('creates on the enrollment, with the end or with null for until further notice', async () => {
    endpoint('/enrollments/i1/absences', { absence: { id: 'a1' }, affected: [] })
    const a = useAbsences()
    await a.create('i1', { startDate: '2026-11-10', endDate: '2026-11-15' })
    expect(last['POST /enrollments/i1/absences']?.body).toEqual({ startDate: '2026-11-10', endDate: '2026-11-15' })
    await a.create('i1', { startDate: '2026-11-10', endDate: null })
    expect(last['POST /enrollments/i1/absences']?.body).toEqual({ startDate: '2026-11-10', endDate: null })
  })

  it('changes, removes and declines with the right paths and bodies', async () => {
    endpoint('/absences/a1', { absence: { id: 'a1' }, affected: [] })
    endpoint('/absences/a1/decline', { declined: ['e1'] })
    const a = useAbsences()
    await a.update('a1', { startDate: '2026-11-11', endDate: null })
    expect(last['PATCH /absences/a1']?.body).toEqual({ startDate: '2026-11-11', endDate: null })
    await a.remove('a1')
    expect(last['DELETE /absences/a1']?.method).toBe('DELETE')
    expect(await a.decline('a1', ['e1'])).toEqual({ declined: ['e1'] })
    expect(last['POST /absences/a1/decline']?.body).toEqual({ eventIds: ['e1'] })
  })
})

describe('useAbsences, free days', () => {
  it('posts the range on the enrollment, with null as the end for from a day onward, and returns the new list', async () => {
    endpoint('/enrollments/i1/absences/free', { absences: [{ id: 'a1', startDate: '2026-12-01', endDate: '2026-12-09' }] })
    const a = useAbsences()
    const r = await a.free('i1', { startDate: '2026-12-10', endDate: '2026-12-12' })
    expect(last['POST /enrollments/i1/absences/free']?.body).toEqual({ startDate: '2026-12-10', endDate: '2026-12-12' })
    expect(r.absences).toHaveLength(1)
    await a.free('i1', { startDate: '2026-12-10', endDate: null })
    expect(last['POST /enrollments/i1/absences/free']?.body).toEqual({ startDate: '2026-12-10', endDate: null })
  })
})

describe('useAbsences, team view', () => {
  it('reads who is away in the season', async () => {
    endpoint('/seasons/s1/absences', [{ enrollmentId: 'i1', absences: [{ startDate: '2026-11-10', endDate: null }] }])
    expect(await useAbsences().ofSeason('s1')).toEqual([{ enrollmentId: 'i1', absences: [{ startDate: '2026-11-10', endDate: null }] }])
  })
})
