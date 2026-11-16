import { expect, test } from '@playwright/test'
import { go, login, PASSWORD, uniqueEmail } from './helpers'

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

async function tokenFromMail(email: string, subject: string): Promise<string> {
  let token: string | undefined
  await expect.poll(async () => {
    const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ subject: string, text: string }>
    const mail = mails.filter(m => m.subject.startsWith(subject)).at(-1)
    token = mail && /token=(\S+)/.exec(mail.text)?.[1]
    return token
  }).toBeTruthy()
  return token!
}

async function account(email: string, name: string) {
  await call('POST', '/auth/registration', null, { email, password: PASSWORD, name, surname: 'Rossi', acceptTerms: true })
  await call('POST', '/auth/verify-email', null, { token: await tokenFromMail(email, '') })
  return call<{ accessToken: string }>('POST', '/auth/login', null, { email, password: PASSWORD })
}

test('a manager deletes their own account from the profile; the sole admin cannot', async ({ page }) => {
  const adminEmail = uniqueEmail('del-admin')
  const managerEmail = uniqueEmail('del-manager')
  const admin = await account(adminEmail, 'Alice')
  const club = await call<{ accessToken: string }>('POST', '/club', admin.accessToken, { name: 'ASD Addio', acceptDpa: true })
  await call('POST', '/invitations', club.accessToken, { email: managerEmail, role: 'manager' })
  const manager = await account(managerEmail, 'Marco')
  await call('POST', '/invitations/accept', manager.accessToken, { token: await tokenFromMail(managerEmail, 'Invito') })

  // The only admin of the club is refused, with the account still working.
  await login(page, adminEmail)
  await expect(page.getByRole('heading', { name: 'Ciao, Alice' })).toBeVisible()
  await go(page, '/profile')
  await page.getByRole('button', { name: 'Elimina il mio account' }).click()
  const adminDialog = page.getByRole('dialog')
  await adminDialog.getByRole('textbox', { name: /^Password/ }).fill(PASSWORD)
  await adminDialog.getByRole('button', { name: 'Elimina definitivamente' }).click()
  await expect(adminDialog.getByText('è l\'ultimo amministratore della società')).toBeVisible()
  await call('GET', '/auth/me', admin.accessToken)

  // The manager deletes the account: a wrong password is refused, the right one ends the session.
  await page.evaluate(() => localStorage.removeItem('tm-session'))
  await login(page, managerEmail)
  await expect(page.getByRole('heading', { name: 'Ciao, Marco' })).toBeVisible()
  await go(page, '/profile')
  await page.getByRole('button', { name: 'Elimina il mio account' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: /^Password/ }).fill('not-the-password')
  await dialog.getByRole('button', { name: 'Elimina definitivamente' }).click()
  await expect(dialog.getByText('La password attuale non è corretta.')).toBeVisible()
  await dialog.getByRole('textbox', { name: /^Password/ }).fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Elimina definitivamente' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Account eliminato', { exact: true })).toBeVisible()

  // The credentials no longer work and the old token is dead.
  await page.getByLabel('Email').fill(managerEmail)
  await page.getByRole('textbox', { name: /^Password/ }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Accedi' }).click()
  await expect(page.getByText('Email o password non corrette.')).toBeVisible()
  const old = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${manager.accessToken}` } })
  expect(old.status).toBe(401)
})
