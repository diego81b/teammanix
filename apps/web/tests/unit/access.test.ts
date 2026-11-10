import { describe, expect, it } from 'vitest'
import { decideAccess, PUBLIC, type AccessStatus } from '../../app/utils/access'

const guest: AccessStatus = { authenticated: false, active: null, memberships: 0, admin: false }
const fresh: AccessStatus = { authenticated: true, active: null, memberships: 0, admin: false }
const chooses: AccessStatus = { authenticated: true, active: null, memberships: 2, admin: false }
const active: AccessStatus = { authenticated: true, active: { recordToComplete: false }, memberships: 1, admin: false }
const admin: AccessStatus = { ...active, admin: true }
const toComplete: AccessStatus = { authenticated: true, active: { recordToComplete: true }, memberships: 1, admin: false }

const ok = { type: 'ok' }
const go = (path: string, redirect?: string) => ({ type: 'go', path, ...(redirect ? { redirect } : {}) })
const decide = (p: string, s: AccessStatus, complete = p) => decideAccess(p, complete, s)

describe('decideAccess', () => {
  describe('guest', () => {
    it.each(PUBLIC)('%s is open', (p) => {
      expect(decide(p, guest)).toEqual(ok)
    })
    it('a private page redirects to login remembering where the user wanted to go', () => {
      expect(decide('/events', guest, '/events?x=1')).toEqual(go('/login', '/events?x=1'))
    })
    it('the home redirects to login without redirect', () => {
      expect(decide('/', guest)).toEqual(go('/login'))
    })
  })

  describe('authenticated', () => {
    it.each(['/login', '/registration', '/password-forgotten'])('%s is not for those already signed in', (p) => {
      expect(decide(p, active)).toEqual(go('/'))
      expect(decide(p, fresh)).toEqual(go('/'))
    })
  })

  describe('without an active club', () => {
    it('first access: everything leads to /welcome', () => {
      expect(decide('/', fresh)).toEqual(go('/welcome'))
      expect(decide('/events', fresh)).toEqual(go('/welcome'))
      expect(decide('/welcome', fresh)).toEqual(ok)
    })
    it('a club can be created', () => {
      expect(decide('/club/new', fresh)).toEqual(ok)
      expect(decide('/club/new', chooses)).toEqual(ok)
    })
    it('several clubs: everything leads to the selection', () => {
      expect(decide('/', chooses)).toEqual(go('/select-club'))
      expect(decide('/select-club', chooses)).toEqual(ok)
    })
    it('public pages (invitation, terms) stay reachable', () => {
      expect(decide('/invitation', fresh)).toEqual(ok)
      expect(decide('/terms', chooses)).toEqual(ok)
    })
  })

  describe('with an active club', () => {
    it('/welcome is no longer needed', () => {
      expect(decide('/welcome', active)).toEqual(go('/'))
    })
    it('/complete-record is not needed if the record is complete', () => {
      expect(decide('/complete-record', active)).toEqual(go('/'))
    })
    it('private pages are open', () => {
      expect(decide('/', active)).toEqual(ok)
      expect(decide('/events', active)).toEqual(ok)
    })
    it('the club can be changed', () => {
      expect(decide('/select-club', active)).toEqual(ok)
    })
  })

  describe('administration pages', () => {
    it.each(['/structure', '/people', '/people/abc', '/seasons/abc', '/seasons/abc/new', '/invitations', '/archive', '/settings'])('%s is admin only', (p) => {
      expect(decide(p, admin)).toEqual(ok)
      expect(decide(p, active)).toEqual(go('/'))
    })
    it('a path that starts like a protected one but differs stays open', () => {
      expect(decide('/people-other', active)).toEqual(ok)
    })
    it('a guest goes to login remembering the page', () => {
      expect(decide('/structure', guest)).toEqual(go('/login', '/structure'))
    })
  })

  describe('record to complete', () => {
    it('the rest of the app redirects to the module', () => {
      expect(decide('/', toComplete)).toEqual(go('/complete-record'))
      expect(decide('/events', toComplete)).toEqual(go('/complete-record'))
    })
    it('the module, club switching, creation and public pages stay reachable', () => {
      for (const p of ['/complete-record', '/select-club', '/club/new', '/invitation', '/privacy']) {
        expect(decide(p, toComplete)).toEqual(ok)
      }
    })
  })
})
