import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery, readBody, readRawBody } from 'h3'
import { useStructure } from '../../app/composables/useStructure'
import { usePeople } from '../../app/composables/usePeople'
import { useCertificates } from '../../app/composables/useCertificates'
import { useAccess } from '../../app/composables/useAccess'

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  const s = useSessionStore()
  s.clear()
  s.token = 'tok'
})

interface Call { method: string, body?: unknown, query?: Record<string, unknown>, type?: string }
const last: Record<string, Call> = {}

/** Registers an endpoint that remembers the last call and responds with `risposta`. */
function endpoint(path: string, response: unknown = {}) {
  registerEndpoint(`/api${path}`, {
    method: undefined as never,
    handler: async (event) => {
      const method = event.method
      const hasBody = !['GET', 'DELETE'].includes(method)
      last[`${method} ${path}`] = {
        method,
        body: hasBody ? await readBody(event).catch(() => undefined) : undefined,
        query: getQuery(event),
        type: event.node.req.headers['content-type'],
      }
      return response
    },
  })
}

describe('useStructure', () => {
  it('reads the tree and the sport profiles', async () => {
    endpoint('/structure', [{ id: 'a1', teams: [] }])
    endpoint('/sport-profiles', [{ code: 'football' }])
    const s = useStructure()
    expect(await s.tree()).toEqual([{ id: 'a1', teams: [] }])
    expect(await s.profiles()).toEqual([{ code: 'football' }])
  })

  it('creates activity, team and season with the right paths', async () => {
    endpoint('/activities', { id: 'a1' })
    endpoint('/activities/a1/teams', { id: 'q1' })
    endpoint('/teams/q1/seasons', { id: 's1' })
    const s = useStructure()
    await s.createActivity({ name: 'Football', sportProfile: 'football' })
    await s.createTeam('a1', { name: 'U14', category: 'Under 14', gender: 'male' })
    await s.createSeason('q1', { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30' })
    expect(last['POST /activities']?.body).toEqual({ name: 'Football', sportProfile: 'football' })
    expect(last['POST /activities/a1/teams']?.body).toMatchObject({ name: 'U14' })
    expect(last['POST /teams/q1/seasons']?.body).toMatchObject({ startDate: '2026-09-01' })
  })

  it('edits with PATCH', async () => {
    endpoint('/activities/a1', {})
    endpoint('/teams/q1', {})
    endpoint('/seasons/s1', {})
    const s = useStructure()
    await s.editActivity('a1', { name: 'New' })
    await s.editTeam('q1', { name: 'U15' })
    await s.editSeason('s1', { league: 'Elite' })
    expect(last['PATCH /activities/a1']?.method).toBe('PATCH')
    expect(last['PATCH /teams/q1']?.body).toEqual({ name: 'U15' })
    expect(last['PATCH /seasons/s1']?.body).toEqual({ league: 'Elite' })
  })

  it('clones a season carrying the remaining suspensions only when asked', async () => {
    endpoint('/seasons/s1/clone', { season: { id: 's2' }, enrollments: 1, suspensions: 1 })
    const s = useStructure()
    const r = await s.clone('s1', { name: 'N', startDate: '2026-09-01', endDate: '2027-06-30', enrollments: ['i1'], carrySuspensions: true })
    expect(last['POST /seasons/s1/clone']?.body).toMatchObject({ carrySuspensions: true })
    expect(r.suspensions).toBe(1)
  })

  it('activates, closes and clones a season', async () => {
    endpoint('/seasons/s1/active', {})
    endpoint('/seasons/s1/close', {})
    endpoint('/seasons/s1/clone', { season: { id: 's2' }, enrollments: 2 })
    const s = useStructure()
    await s.active('s1')
    await s.close('s1')
    const r = await s.clone('s1', { name: 'N', startDate: '2026-09-01', endDate: '2027-06-30', enrollments: ['i1', 'i2'] })
    expect(last['POST /seasons/s1/active']?.method).toBe('POST')
    expect(last['POST /seasons/s1/close']?.method).toBe('POST')
    expect(last['POST /seasons/s1/clone']?.body).toMatchObject({ enrollments: ['i1', 'i2'] })
    expect(r.enrollments).toBe(2)
  })
})

describe('usePeople', () => {
  it('searches with the q parameter and without it when empty', async () => {
    endpoint('/people', [])
    const p = usePeople()
    await p.list('ros')
    expect(last['GET /people']?.query).toEqual({ q: 'ros' })
    await p.list('')
    expect(last['GET /people']?.query).toEqual({})
  })

  it('detail, disable and re-enable', async () => {
    endpoint('/people/p1', { id: 'p1' })
    endpoint('/people/p1/disable', {})
    endpoint('/people/p1/reenable', {})
    const p = usePeople()
    expect(await p.detail('p1')).toEqual({ id: 'p1' })
    await p.disable('p1')
    await p.reenable('p1')
    expect(last['POST /people/p1/disable']?.method).toBe('POST')
    expect(last['POST /people/p1/reenable']?.method).toBe('POST')
  })

  it('creates a person and reads the disabled ones', async () => {
    endpoint('/people/disabled', [{ id: 'x' }])
    endpoint('/people', { id: 'p9' })
    const p = usePeople()
    expect(await p.disabled()).toEqual([{ id: 'x' }])
    await p.create({ name: 'Mario', email: 'm@x.it' })
    expect(last['POST /people']?.body).toEqual({ name: 'Mario', email: 'm@x.it' })
  })

  it('roster, enrollment, edit, close and promotion', async () => {
    endpoint('/seasons/s1/roster', [{ id: 'i1' }])
    endpoint('/seasons/s1/enrollments', { id: 'i2' })
    endpoint('/enrollments/i1', {})
    endpoint('/enrollments/i1/close', {})
    endpoint('/enrollments/i1/promote', {})
    const p = usePeople()
    expect(await p.roster('s1')).toEqual([{ id: 'i1' }])
    await p.enroll('s1', { personId: 'p1', type: 'player', jerseyNumber: 7 })
    await p.editEnrollment('i1', { status: 'injured' })
    await p.closeEnrollment('i1')
    await p.promote('i1', { seasonId: 's2', closeSource: true })
    expect(last['POST /seasons/s1/enrollments']?.body).toMatchObject({ jerseyNumber: 7 })
    expect(last['PATCH /enrollments/i1']?.body).toEqual({ status: 'injured' })
    expect(last['POST /enrollments/i1/close']?.method).toBe('POST')
    expect(last['POST /enrollments/i1/promote']?.body).toEqual({ seasonId: 's2', closeSource: true })
  })
})

describe('useCertificates', () => {
  it('lists, creates, edits and deletes', async () => {
    endpoint('/people/p1/certificates', { status: 'missing', expiry: null, certificates: [] })
    endpoint('/certificates/c1', {})
    const c = useCertificates()
    expect((await c.list('p1')).status).toBe('missing')
    await c.create('p1', { type: 'competitive', issueDate: '2026-01-01', expiryDate: '2027-01-01' })
    await c.edit('c1', { expiryDate: '2027-02-01' })
    await c.remove('c1')
    expect(last['POST /people/p1/certificates']?.body).toMatchObject({ type: 'competitive' })
    expect(last['PATCH /certificates/c1']?.body).toEqual({ expiryDate: '2027-02-01' })
    expect(last['DELETE /certificates/c1']?.method).toBe('DELETE')
  })

  it('reads the players due in a season: names, status and dates', async () => {
    const row = { personId: 'p1', name: 'Anna', surname: 'Rossi', status: 'expiring', expiry: '2026-12-01', daysLeft: 20 }
    endpoint('/seasons/s1/certificates-due', [row])
    expect(await useCertificates().due('s1')).toEqual([row])
  })

  it('uploads the file as a raw binary body with its type', async () => {
    let type: string | undefined
    let byte = 0
    registerEndpoint('/api/certificates/c1/file', {
      method: 'PUT',
      handler: async (event) => {
        type = event.node.req.headers['content-type']
        byte = (await readRawBody(event, false))?.length ?? 0
        return {}
      },
    })
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'c.pdf', { type: 'application/pdf' })
    await useCertificates().loadFile('c1', file)
    expect(type).toBe('application/pdf')
    expect(byte).toBe(4)
  })

  it('downloads the file as a blob', async () => {
    registerEndpoint('/api/certificates/c2/file', {
      method: 'GET',
      handler: (event) => {
        event.node.res.setHeader('Content-Type', 'application/pdf')
        return new Uint8Array([37, 80, 68, 70])
      },
    })
    const blob = await useCertificates().downloadFile('c2')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBe(4)
  })

  it('reads and updates the file setting', async () => {
    endpoint('/club/current/settings', { certificatesWithFile: false })
    const c = useCertificates()
    expect(await c.settings()).toEqual({ certificatesWithFile: false })
    await c.setFile(true)
    expect(last['PATCH /club/current/settings']?.body).toEqual({ certificatesWithFile: true })
  })
})

describe('useAccess', () => {
  it('invitations: lists, creates, resends, revokes', async () => {
    endpoint('/invitations', [])
    endpoint('/invitations/i1/resend', {})
    endpoint('/invitations/i1', {})
    const a = useAccess()
    await a.invitations()
    await a.invite({ email: 'x@y.it', role: 'player', name: 'Luca' })
    await a.resend('i1')
    await a.revoke('i1')
    expect(last['POST /invitations']?.body).toEqual({ email: 'x@y.it', role: 'player', name: 'Luca' })
    expect(last['POST /invitations/i1/resend']?.method).toBe('POST')
    expect(last['DELETE /invitations/i1']?.method).toBe('DELETE')
  })

  it('roles and permissions', async () => {
    endpoint('/roles', [])
    endpoint('/roles/r1', {})
    endpoint('/permissions', [])
    endpoint('/permissions/u1', {})
    const a = useAccess()
    await a.roles()
    await a.removeRole('r1')
    await a.permissions()
    await a.setPermissions('u1', { 'events.manage': true })
    expect(last['DELETE /roles/r1']?.method).toBe('DELETE')
    expect(last['PUT /permissions/u1']?.body).toEqual({ diff: { 'events.manage': true } })
  })
})
