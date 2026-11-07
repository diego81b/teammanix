/**
 * Page access rules, pure: no router or store, so testable in isolation.
 * The `auth.global` middleware collects the state and applies the outcome.
 */
export const PUBLIC = [
  '/login',
  '/registration',
  '/check-email',
  '/verify-email',
  '/password-forgotten',
  '/reset-password',
  '/invitation',
  '/terms',
  '/privacy',
  '/dpa',
]
const ONLY_GUESTS = ['/login', '/registration', '/password-forgotten']
/** Administration pages: admin only for now (the API enforces it anyway; here we avoid a page that would only give errors). */
const ADMIN_ONLY = ['/structure', '/people', '/seasons', '/invitations', '/archive']
const eAdminOnly = (path: string) => ADMIN_ONLY.some((p) => path === p || path.startsWith(`${p}/`))

/** Pages reachable by an authenticated account that has no active club (yet). */
const WITHOUT_CLUB = ['/welcome', '/club/new', '/select-club']

export interface AccessStatus {
  authenticated: boolean
  /** Active club with only the data needed here, or null if there is none. */
  active: { recordToComplete: boolean } | null
  memberships: number
  /** Club-scope admin in the active club. */
  admin: boolean
}

export type AccessOutcome
  = | { type: 'ok' }
    | { type: 'go', path: string, redirect?: string }

const OK: AccessOutcome = { type: 'ok' }
const go = (path: string, redirect?: string): AccessOutcome => ({ type: 'go', path, ...(redirect ? { redirect } : {}) })

/** @param percorso path without query (`to.path`); @param completo path with query (`to.fullPath`), to restore after login. */
export function decideAccess(path: string, complete: string, s: AccessStatus): AccessOutcome {
  if (!s.authenticated) {
    if (PUBLIC.includes(path)) return OK
    return go('/login', complete === '/' ? undefined : complete)
  }

  if (ONLY_GUESTS.includes(path)) return go('/')

  // No active club: 0 memberships = first access, more than one = choice (with a single one the server activates it at login).
  if (!s.active) {
    if (PUBLIC.includes(path)) return OK
    const home = s.memberships === 0 ? '/welcome' : '/select-club'
    if (path === '/club/new' || path === home) return OK
    return go(home)
  }

  if (path === '/welcome') return go('/')

  // Active club but registry record to complete: form first.
  if (s.active.recordToComplete) {
    if (PUBLIC.includes(path) || path === '/complete-record' || WITHOUT_CLUB.includes(path)) return OK
    return go('/complete-record')
  }
  if (path === '/complete-record') return go('/')
  if (eAdminOnly(path) && !s.admin) return go('/')
  return OK
}
