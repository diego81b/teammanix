import { expect, test } from '@playwright/test'
import { go, login, PASSWORD, uniqueEmail } from './helpers'

const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api'
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
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

/** Last token received by email: the verification right after a registration. */
async function tokenFromOutbox(email: string): Promise<string> {
  let token: string | undefined
  await expect.poll(async () => {
    const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ text: string }>
    token = mails.at(-1) && /token=(\S+)/.exec(mails.at(-1)!.text)?.[1]
    return token
  }).toBeTruthy()
  return token!
}

/** An admin with a club, a team and an active season, and a person who is not enrolled yet. */
async function setup() {
  const email = uniqueEmail('roles')
  await call('POST', '/auth/registration', null, { email, password: PASSWORD, name: 'Ada', surname: 'Rossi', acceptTerms: true })
  await call('POST', '/auth/verify-email', null, { token: await tokenFromOutbox(email) })
  const session = await call<{ accessToken: string }>('POST', '/auth/login', null, { email, password: PASSWORD })
  const club = await call<{ accessToken: string }>('POST', '/club', session.accessToken, { name: 'ASD Roles', acceptDpa: true })
  const admin = club.accessToken
  const team = await call<{ id: string }>('POST', '/teams', admin, { name: 'Under 12', sportProfile: 'football' })
  const season = await call<{ id: string }>('POST', `/teams/${team.id}/seasons`, admin, { name: 'Ora', startDate: day(-30), endDate: day(300) })
  await call('POST', `/seasons/${season.id}/active`, admin)
  await call('POST', '/people', admin, { name: 'Gino', surname: 'Bianchi', birthDate: '1985-05-05', email: uniqueEmail('gino') })
  return { email, seasonId: season.id }
}

test('an admin adds a staff role in the settings, enrolls a person with it and the roster shows its name', async ({ page }) => {
  const { email, seasonId } = await setup()
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  await go(page, '/settings')
  await expect(page.getByRole('heading', { name: 'Ruoli dello staff' })).toBeVisible()
  // A new club starts with the default roles.
  await expect(page.getByText('Allenatore', { exact: true })).toBeVisible()
  await expect(page.getByText('Accompagnatore', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Aggiungi ruolo' }).click()
  const form = page.getByRole('dialog', { name: 'Nuovo ruolo' })
  await form.getByRole('textbox', { name: /^Nome del ruolo/ }).fill('Massaggiatore')
  await form.getByRole('button', { name: 'Salva' }).click()
  await expect(page.getByText('Massaggiatore', { exact: true })).toBeVisible()

  await go(page, `/seasons/${seasonId}`)
  await page.getByRole('button', { name: 'Aggiungi persone' }).click()
  const enroll = page.getByRole('dialog', { name: 'Aggiungi persone' })
  // Pick from the open list: typing in the search box first would validate the form on blur and move the list.
  await enroll.getByRole('button', { name: /Gino Bianchi/ }).click()
  await expect(enroll.getByRole('button', { name: /Gino Bianchi/ })).toHaveAttribute('aria-pressed', 'true')
  await enroll.getByRole('combobox', { name: /^Tipo/ }).click()
  await page.getByRole('option', { name: 'Staff', exact: true }).click()
  await enroll.getByRole('combobox', { name: /^Ruolo nello staff/ }).click()
  await page.getByRole('option', { name: 'Massaggiatore' }).click()
  await enroll.getByRole('button', { name: 'Iscrivi' }).click()

  await expect(page.getByRole('row', { name: /Gino Bianchi.*Massaggiatore/ })).toBeVisible()
})

test('an archived role is not offered for a new enrollment and can be restored', async ({ page }) => {
  const { email, seasonId } = await setup()
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  await go(page, '/settings')
  const preparatore = page.getByRole('listitem').filter({ hasText: 'Preparatore' }).filter({ hasText: 'Come il preparatore' })
  await preparatore.getByRole('button', { name: 'Archivia' }).click()
  await expect(preparatore.getByText('archiviato', { exact: true })).toBeVisible()

  await go(page, `/seasons/${seasonId}`)
  await page.getByRole('button', { name: 'Aggiungi persone' }).click()
  const enroll = page.getByRole('dialog', { name: 'Aggiungi persone' })
  await enroll.getByRole('combobox', { name: /^Tipo/ }).click()
  await page.getByRole('option', { name: 'Staff', exact: true }).click()
  await enroll.getByRole('combobox', { name: /^Ruolo nello staff/ }).click()
  await expect(page.getByRole('option', { name: 'Allenatore', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Preparatore', exact: true })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await go(page, '/settings')
  await page.getByRole('listitem').filter({ hasText: 'Preparatore' }).getByRole('button', { name: 'Ripristina' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Preparatore' }).getByText('archiviato', { exact: true })).toHaveCount(0)
})
