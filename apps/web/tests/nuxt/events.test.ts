import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery, readBody } from 'h3'
import { useEvents } from '../../app/composables/useEvents'

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  const s = useSessionStore()
  s.clear()
  s.token = 'tok'
})

interface Call { method: string, body?: unknown, query?: Record<string, unknown> }
const last: Record<string, Call> = {}

function endpoint(path: string, response: unknown = {}) {
  registerEndpoint(`/api${path}`, {
    method: undefined as never,
    handler: async (event) => {
      const method = event.method
      last[`${method} ${path}`] = {
        method,
        body: ['GET', 'DELETE'].includes(method) ? undefined : await readBody(event).catch(() => undefined),
        query: getQuery(event),
      }
      return response
    },
  })
}

describe('useEvents', () => {
  it('reads events, access, competitions, venues and opponents', async () => {
    endpoint('/seasons/s1/events', [{ id: 'e1' }])
    endpoint('/seasons/s1/events-access', { teamId: 't1', canManage: true })
    endpoint('/seasons/s1/competitions', ['Cup'])
    endpoint('/venues', [{ id: 'v1', name: 'Stadium', address: null }])
    endpoint('/teams/t1/opponents', [{ id: 'o1', name: 'Rivals' }])
    const ev = useEvents()
    expect(await ev.list('s1')).toEqual([{ id: 'e1' }])
    expect(await ev.access('s1')).toEqual({ teamId: 't1', canManage: true })
    expect(await ev.competitions('s1')).toEqual(['Cup'])
    expect(await ev.venues()).toEqual([{ id: 'v1', name: 'Stadium', address: null }])
    expect(await ev.opponents('t1')).toEqual([{ id: 'o1', name: 'Rivals' }])
  })

  it('creates, edits, cancels and postpones with the right paths', async () => {
    endpoint('/teams/t1/events', { id: 'e1' })
    endpoint('/events/e1', { id: 'e1' })
    endpoint('/events/e1/cancel', { id: 'e1', status: 'cancelled' })
    endpoint('/events/e1/postpone', { id: 'e1', status: 'postponed' })
    const ev = useEvents()
    const body = { type: 'training' as const, start: '2026-10-06T16:00:00.000Z', end: '2026-10-06T17:00:00.000Z', title: null, venueId: null, note: null }
    await ev.create('t1', body)
    expect(last['POST /teams/t1/events']).toMatchObject({ method: 'POST', body })
    await ev.edit('e1', { note: 'x' })
    expect(last['PATCH /events/e1']).toMatchObject({ method: 'PATCH', body: { note: 'x' } })
    expect((await ev.cancel('e1')).status).toBe('cancelled')
    expect((await ev.postpone('e1')).status).toBe('postponed')
  })

  it('creates, reads and edits a series with the right paths', async () => {
    endpoint('/teams/t1/series', { id: 'sr1', eventCount: 4 })
    endpoint('/series/sr1', { id: 'sr1', timeStart: '19:00' })
    const ev = useEvents()
    const body = { type: 'training' as const, title: null, venueId: null, weekdays: ['TU' as const, 'TH' as const], intervalWeeks: 1, startDate: '2026-10-06', timeStart: '18:00', durationMinutes: 90 }
    expect((await ev.createSeries('t1', body)).eventCount).toBe(4)
    expect(last['POST /teams/t1/series']).toMatchObject({ method: 'POST', body })
    expect((await ev.series('sr1')).timeStart).toBe('19:00')
    await ev.editSeries('sr1', { title: null, venueId: null, weekdays: ['MO'], intervalWeeks: 2, endDate: null, timeStart: '19:00', durationMinutes: 60 })
    expect(last['PATCH /series/sr1']).toMatchObject({ method: 'PATCH', body: { weekdays: ['MO'], endDate: null, timeStart: '19:00' } })
  })

  it('creates and edits a venue', async () => {
    endpoint('/venues', { id: 'v1' })
    endpoint('/venues/v1', { id: 'v1' })
    const ev = useEvents()
    await ev.createVenue({ name: 'Stadium', address: 'Via Roma 1' })
    expect(last['POST /venues']!.body).toEqual({ name: 'Stadium', address: 'Via Roma 1' })
    await ev.editVenue('v1', { name: 'Arena' })
    expect(last['PATCH /venues/v1']!.body).toEqual({ name: 'Arena' })
  })
})
