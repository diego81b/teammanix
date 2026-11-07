export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSessionStore()

  // First start with the saved token: realign memberships and club before deciding.
  if (session.token && !session.verified) await session.refresh()

  const outcome = decideAccess(to.path, to.fullPath, {
    authenticated: !!session.token,
    active: session.active,
    memberships: session.memberships.length,
    admin: session.isAdmin,
  })
  if (outcome.type === 'ok') return
  return navigateTo(outcome.redirect ? { path: outcome.path, query: { redirect: outcome.redirect } } : outcome.path)
})
