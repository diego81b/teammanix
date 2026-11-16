/** Actions of the logged in account on itself. */
export function useAccount() {
  const api = useApi()
  const session = useSessionStore()
  return {
    /**
     * Erases the own account (art. 17). A wrong password comes back as a 401 that is not an expired session,
     * so the client must not log out on it. Once the account is gone the saved session goes too.
     */
    async deleteAccount(password: string) {
      await api<void>('/auth/delete-account', { method: 'POST', body: { password }, withoutLogoutOn401: true })
      session.clear()
    },
  }
}
