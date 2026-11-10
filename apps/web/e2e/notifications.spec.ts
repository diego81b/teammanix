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

/** A verified account with a club, created through the API. */
async function setup() {
  const email = uniqueEmail('notif')
  await call('POST', '/auth/registration', null, { email, password: PASSWORD, name: 'Ada', surname: 'Rossi', acceptTerms: true })
  let token: string | undefined
  await expect.poll(async () => {
    const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ text: string }>
    token = mails.at(-1) && /token=(\S+)/.exec(mails.at(-1)!.text)?.[1]
    return token
  }).toBeTruthy()
  await call('POST', '/auth/verify-email', null, { token })
  const session = await call<{ accessToken: string }>('POST', '/auth/login', null, { email, password: PASSWORD })
  await call('POST', '/club', session.accessToken, { name: 'ASD Notifiche', acceptDpa: true })
  return { email }
}

test('the notification center opens from the bell and says so when there is nothing yet', async ({ page }) => {
  const { email } = await setup()
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  await page.getByRole('link', { name: 'Notifiche' }).click()
  await expect(page.getByRole('heading', { name: 'Notifiche' })).toBeVisible()
  await expect(page.getByText('Nessuna notifica.')).toBeVisible()
})

test('the chosen theme and the channel choices are still there after reopening', async ({ page }) => {
  const { email } = await setup()
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  await go(page, '/profile')
  await expect(page.getByRole('heading', { name: 'Profilo e notifiche' })).toBeVisible()

  // Theme.
  await page.getByRole('radio', { name: 'Scuro' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  // Channel: email off for the club.
  const emailSwitch = page.getByRole('switch', { name: 'ASD Notifiche: Email' })
  await expect(emailSwitch).toBeChecked()
  await emailSwitch.click()
  await expect(page.getByText('Preferenze salvate').first()).toBeVisible()

  await go(page, '/profile')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('switch', { name: 'ASD Notifiche: Email' })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: 'ASD Notifiche: Nell\'app' })).toBeChecked()
})
