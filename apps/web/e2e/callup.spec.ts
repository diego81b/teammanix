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

/** Registers and verifies an admin through the API, then builds a club with an active season, two players and tomorrow's training. */
async function setup() {
  const email = uniqueEmail('callup')
  await call('POST', '/auth/registration', null, { email, password: PASSWORD, name: 'Ada', surname: 'Rossi', acceptTerms: true })
  let token: string | undefined
  await expect.poll(async () => {
    const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ text: string }>
    token = mails.at(-1) && /token=(\S+)/.exec(mails.at(-1)!.text)?.[1]
    return token
  }).toBeTruthy()
  await call('POST', '/auth/verify-email', null, { token })
  const session = await call<{ accessToken: string }>('POST', '/auth/login', null, { email, password: PASSWORD })
  const club = await call<{ accessToken: string }>('POST', '/club', session.accessToken, { name: 'ASD Callup', acceptDpa: true })
  const admin = club.accessToken

  const activity = await call<{ id: string }>('POST', '/activities', admin, { name: 'Calcio', sportProfile: 'football' })
  const team = await call<{ id: string }>('POST', `/activities/${activity.id}/teams`, admin, { name: 'Under 12' })
  const season = await call<{ id: string }>('POST', `/teams/${team.id}/seasons`, admin, { name: 'Ora', startDate: day(-30), endDate: day(300) })
  for (const name of ['Bruno', 'Carla']) {
    const p = await call<{ id: string }>('POST', '/people', admin, { name, surname: 'Verdi', birthDate: '2014-03-04', email: `${name.toLowerCase()}-${email}` })
    await call('POST', `/seasons/${season.id}/enrollments`, admin, { personId: p.id, type: 'player' })
    await call('POST', `/people/${p.id}/certificates`, admin, { type: 'competitive', issueDate: day(-5), expiryDate: day(300) })
  }
  await call('POST', `/seasons/${season.id}/active`, admin)
  const event = await call<{ id: string }>('POST', `/teams/${team.id}/events`, admin, {
    type: 'training',
    start: `${day(1)}T16:00:00Z`,
    end: `${day(1)}T17:30:00Z`,
  })
  return { email, eventId: event.id }
}

test('the coach calls up two players from the callable list and sends only the new ones', async ({ page }) => {
  const { email, eventId } = await setup()
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  await go(page, `/events/${eventId}/callup`)
  await expect(page.getByRole('heading', { name: 'Convocazione' })).toBeVisible()
  await page.getByRole('tab', { name: /Convocabili/ }).click()

  await page.getByRole('button', { name: 'Convoca Bruno Verdi' }).click()
  await page.getByRole('tab', { name: /Convocati/ }).click()
  await expect(page.getByText('Bruno Verdi')).toBeVisible()

  await page.getByRole('button', { name: 'Invia ai nuovi (1)' }).click()
  await expect(page.getByText('Convocazione inviata (1).', { exact: true })).toBeVisible()

  // Calling up one more player: the next send reaches only that one.
  await page.getByRole('tab', { name: /Convocabili/ }).click()
  await page.getByRole('button', { name: 'Convoca Carla Verdi' }).click()
  await expect(page.getByRole('button', { name: 'Invia ai nuovi (1)' })).toBeVisible()
})
