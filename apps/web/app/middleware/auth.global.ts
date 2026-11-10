import type { SessionDto } from '~/types/api'

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSessionStore()

  // First start with the saved token: realign memberships and club before deciding.
  if (session.token && !session.verified) await session.refresh()

  // A link from a notification of another club carries `?club=`: switch to it, then reopen the same page without the parameter.
  const club = session.token ? clubToSwitch(to.query.club, session.activeClubId, session.memberships) : null
  if (club) {
    try {
      session.set(await useApi()<SessionDto>('/auth/select-club', { body: { clubId: club } }))
    }
    catch { /* stay in the active club: the page still opens */ }
    return navigateTo({ path: to.path, query: withoutClubQuery(to.query) as Record<string, string>, hash: to.hash }, { replace: true })
  }

  const outcome = decideAccess(to.path, to.fullPath, {
    authenticated: !!session.token,
    active: session.active,
    memberships: session.memberships.length,
    admin: session.isAdmin,
  })
  if (outcome.type === 'ok') return
  return navigateTo(outcome.redirect ? { path: outcome.path, query: { redirect: outcome.redirect } } : outcome.path)
})
