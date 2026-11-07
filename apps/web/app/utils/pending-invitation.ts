// The invitation token must survive registration, email verification (usually in another tab) and login.
// That is why it lives in localStorage and not in sessionStorage.
const KEY = 'tm-invitation'

export const pendingInvitation = {
  read(): string | null {
    try {
      return localStorage.getItem(KEY)
    }
    catch {
      return null
    }
  },
  save(token: string) {
    try {
      localStorage.setItem(KEY, token)
    }
    catch { /* without storage the token stays only in the URL */ }
  },
  remove() {
    try {
      localStorage.removeItem(KEY)
    }
    catch { /* nothing to do */ }
  },
}

/** Accepts only internal paths: avoids open redirect via ?redirect=. */
export function internalPath(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null
}
