import { expect, test } from '@playwright/test'
import { go, login, PASSWORD, registerAndVerify, uniqueEmail } from './helpers'

const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api'

async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${await r.text()}`)
  return (r.status === 204 ? undefined : await r.json()) as T
}

test('register on your own, then accept the invitation from /welcome', async ({ page }) => {
  const adminEmail = uniqueEmail('welcome-admin')
  const email = uniqueEmail('welcome-invitee')

  await call('POST', '/auth/registration', null, { email: adminEmail, password: PASSWORD, name: 'Alice', surname: 'Rossi', acceptTerms: true })
  const mail = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(adminEmail)}`)).json()) as Array<{ text: string }>
  const verify = /token=(\S+)/.exec(mail.at(-1)!.text)![1]
  await call('POST', '/auth/verify-email', null, { token: verify })
  const admin = await call<{ accessToken: string }>('POST', '/auth/login', null, { email: adminEmail, password: PASSWORD })
  const club = await call<{ accessToken: string }>('POST', '/club', admin.accessToken, { name: 'ASD Benvenuto', acceptDpa: true })
  await call('POST', '/invitations', club.accessToken, { email, role: 'manager' })

  // The invitee registers on their own and never opens the email link.
  await page.setViewportSize({ width: 390, height: 844 })
  await registerAndVerify(page, email, 'Marco')
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'I tuoi inviti' })).toBeVisible()
  const card = page.getByRole('listitem').filter({ hasText: 'ASD Benvenuto' })
  await expect(card).toContainText('Dirigente')
  await card.getByRole('button', { name: /Accetta/ }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Ciao, Marco' })).toBeVisible()
  expect((await call<Array<unknown>>('GET', '/invitations/mine', (await call<{ accessToken: string }>('POST', '/auth/login', null, { email, password: PASSWORD })).accessToken))).toEqual([])
})

test('without open invitations /welcome shows the account email and still offers the link field', async ({ page }) => {
  const email = uniqueEmail('welcome-none')
  await page.setViewportSize({ width: 390, height: 844 })
  await registerAndVerify(page, email, 'Nina')
  await login(page, email)
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Crea la tua società' })).toBeVisible()
  await page.getByRole('button', { name: 'Hai un link d\'invito?' }).click()
  await expect(page.getByLabel('Link dell\'invito')).toBeVisible()
})
