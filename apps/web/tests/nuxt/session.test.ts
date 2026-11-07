import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import type { Membership, SessionDto } from '../../app/types/api'

const navigateToMock = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navigateToMock)

const adminClub: Membership = {
  clubId: 's1',
  name: 'ASD Test',
  roles: [{ role: 'admin', scope: 'club', activityId: null, teamId: null }],
  linkedToPerson: false,
  recordToComplete: false,
}
const manager: Membership = {
  ...adminClub,
  clubId: 's2',
  name: 'Other',
  roles: [{ role: 'manager', scope: 'team', activityId: 'a1', teamId: 'q1' }],
}
const session = (over: Partial<SessionDto> = {}): SessionDto => ({
  accessToken: 'tok',
  user: { id: 'u1', email: 'a@b.it', name: 'Ada', surname: 'Rossi', language: 'it' },
  activeClub: { id: 's1', name: 'ASD Test' },
  memberships: [adminClub, manager],
  ...over,
})

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  useSessionStore().clear()
  navigateToMock.mockReset()
})

describe('session store', () => {
  it('starts empty and unauthenticated', () => {
    const s = useSessionStore()
    expect(s.authenticated).toBe(false)
    expect(s.active).toBeNull()
    expect(s.isAdmin).toBe(false)
  })

  it('set: fills the state and saves to localStorage', () => {
    const s = useSessionStore()
    s.set(session())
    expect(s.authenticated).toBe(true)
    expect(s.verified).toBe(true)
    expect(s.active?.clubId).toBe('s1')
    expect(JSON.parse(localStorage.getItem('tm-session')!).token).toBe('tok')
  })

  it('isAdmin holds only for club-scope admins in the active club', () => {
    const s = useSessionStore()
    s.set(session())
    expect(s.isAdmin).toBe(true)
    s.set(session({ activeClub: { id: 's2', name: 'Other' } }))
    expect(s.isAdmin).toBe(false)
  })

  it('without an active club: active is null', () => {
    const s = useSessionStore()
    s.set(session({ activeClub: null }))
    expect(s.active).toBeNull()
  })

  it('clear: resets everything and removes the storage', () => {
    const s = useSessionStore()
    s.set(session())
    s.clear()
    expect(s.authenticated).toBe(false)
    expect(s.user).toBeNull()
    expect(s.memberships).toEqual([])
    expect(s.verified).toBe(false)
    expect(localStorage.getItem('tm-session')).toBeNull()
  })

  it('setLanguage: updates user and storage, ignored if unauthenticated', () => {
    const s = useSessionStore()
    s.setLanguage('fr')
    expect(s.user).toBeNull()
    s.set(session())
    s.setLanguage('fr')
    expect(s.user?.language).toBe('fr')
    expect(JSON.parse(localStorage.getItem('tm-session')!).user.language).toBe('fr')
  })

  it('without localStorage it does not throw', () => {
    const s = useSessionStore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(() => s.set(session())).not.toThrow()
    expect(s.authenticated).toBe(true)
    vi.restoreAllMocks()
  })

  describe('refresh', () => {
    const me = () => ({
      user: { id: 'u1', email: 'a@b.it', name: 'Ada', surname: 'Rossi', language: 'en' },
      activeClub: adminClub,
      memberships: [adminClub],
    })

    it('realigns the state with the server', async () => {
      registerEndpoint('/api/auth/me', () => me())
      const s = useSessionStore()
      s.set(session({ memberships: [adminClub, manager] }))
      s.verified = false
      await s.refresh()
      expect(s.verified).toBe(true)
      expect(s.user?.language).toBe('en')
      expect(s.memberships).toHaveLength(1)
    })

    it('401: clears the session and goes to login', async () => {
      registerEndpoint('/api/auth/me', () => new Response(JSON.stringify({ code: 'INVALID_TOKEN' }), { status: 401, headers: { 'content-type': 'application/json' } }))
      const s = useSessionStore()
      s.set(session())
      await s.refresh()
      expect(s.authenticated).toBe(false)
      expect(navigateToMock).toHaveBeenCalledWith('/login')
    })
  })
})
