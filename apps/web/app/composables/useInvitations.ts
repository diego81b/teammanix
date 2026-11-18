import type { MyInvitation, SessionDto } from '~/types/api'

/** Invitations of the signed-in account, to accept them without the email link. */
export function useInvitations() {
  const api = useApi()
  const session = useSessionStore()
  return {
    mine: () => api<MyInvitation[]>('/invitations/mine'),
    /** Accepting switches the session to the new club, like the link flow. */
    async acceptMine(id: string) {
      const dto = await api<SessionDto>(`/invitations/mine/${id}/accept`, { method: 'POST' })
      session.set(dto)
    },
  }
}
