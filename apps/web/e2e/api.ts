import { expect, type Page } from '@playwright/test'
import type { SessionDto } from '../app/types/api'
import { PASSWORD } from './helpers'

export type { SessionDto }

export const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api'

/** Calendar day (YYYY-MM-DD) `offset` days from today. */
export const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

export async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${await r.text()}`)
  return (r.status === 204 ? undefined : await r.json()) as T
}

/** Last token received by email: the verification right after a registration, the invitation right after an invite. */
export async function tokenFromOutbox(email: string): Promise<string> {
  let token: string | undefined
  await expect.poll(async () => {
    const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ text: string }>
    token = mails.at(-1) && /token=(\S+)/.exec(mails.at(-1)!.text)?.[1]
    return token
  }).toBeTruthy()
  return token!
}

/** Registers and verifies a user through the API and returns the session. */
export async function verifiedSession(email: string, name = 'Ada') {
  await call('POST', '/auth/registration', null, { email, password: PASSWORD, name, surname: 'Rossi', acceptTerms: true })
  await call('POST', '/auth/verify-email', null, { token: await tokenFromOutbox(email) })
  return call<SessionDto>('POST', '/auth/login', null, { email, password: PASSWORD })
}

/** Opens every page of this browser context already signed in, with no UI login (shape of stores/session.ts). */
export async function useSession(page: Page, dto: SessionDto) {
  const saved = { token: dto.accessToken, user: dto.user, activeClubId: dto.activeClub?.id ?? null, memberships: dto.memberships }
  await page.addInitScript((s) => localStorage.setItem('tm-session', JSON.stringify(s)), saved)
}
