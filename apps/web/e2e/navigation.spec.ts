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

/** A verified admin with a club, created through the API. */
async function setup() {
  const email = uniqueEmail('menu')
  await call('POST', '/auth/registration', null, { email, password: PASSWORD, name: 'Ada', surname: 'Rossi', acceptTerms: true })
  let token: string | undefined
  await expect.poll(async () => {
    const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ text: string }>
    token = mails.at(-1) && /token=(\S+)/.exec(mails.at(-1)!.text)?.[1]
    return token
  }).toBeTruthy()
  await call('POST', '/auth/verify-email', null, { token })
  const session = await call<{ accessToken: string }>('POST', '/auth/login', null, { email, password: PASSWORD })
  await call('POST', '/club', session.accessToken, { name: 'ASD Menu', acceptDpa: true })
  return { email }
}

test('an admin with no person record sees Home and Calendario next to the club group, with the account menu reduced to account things', async ({ page }) => {
  const { email } = await setup()
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  const sidebar = page.getByRole('navigation', { name: 'Navigazione principale' }).first()
  await expect(sidebar.getByRole('group', { name: 'Il mio spazio' }).getByRole('link')).toHaveText(['Home', 'Calendario'])
  await expect(sidebar.getByRole('group', { name: 'Società' }).getByRole('link')).toHaveText(['Squadre', 'Persone', 'Inviti e ruoli', 'Impostazioni'])

  await page.getByRole('button', { name: 'Menu dell\'account' }).click()
  await expect(page.getByRole('menuitem')).toHaveText(['Profilo e notifiche', 'Cambia società', 'Esci'])
})

test('on a phone the admin reaches the club pages from the "Altro" sheet, which closes on navigation and gives the focus back', async ({ page }) => {
  const { email } = await setup()
  await page.setViewportSize({ width: 400, height: 800 })
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  const tabs = page.getByRole('navigation', { name: 'Navigazione principale' })
  await expect(tabs.getByRole('link')).toHaveText(['Home', 'Calendario', 'Squadre', 'Persone'])

  const more = tabs.getByRole('button', { name: 'Altro' })
  await more.click()
  const sheet = page.getByRole('dialog', { name: 'Altro' })
  await expect(sheet.getByRole('link')).toHaveText(['Inviti e ruoli', 'Impostazioni'])
  for (const link of await sheet.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  await sheet.getByRole('link', { name: 'Impostazioni' }).click()
  await expect(page.getByRole('heading', { name: 'Impostazioni della società' })).toBeVisible()
  await expect(sheet).toHaveCount(0)
  await expect(more).toBeFocused()
})
