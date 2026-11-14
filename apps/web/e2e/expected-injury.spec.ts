import { expect, type Page, test } from '@playwright/test'
import { go, login, PASSWORD, staffRoleId, uniqueEmail } from './helpers'

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

async function tokenFromOutbox(email: string): Promise<string> {
  let token: string | undefined
  await expect.poll(async () => {
    const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ text: string }>
    token = mails.at(-1) && /token=(\S+)/.exec(mails.at(-1)!.text)?.[1]
    return token
  }).toBeTruthy()
  return token!
}

async function verifiedSession(email: string, name: string) {
  await call('POST', '/auth/registration', null, { email, password: PASSWORD, name, surname: 'Rossi', acceptTerms: true })
  await call('POST', '/auth/verify-email', null, { token: await tokenFromOutbox(email) })
  return call<{ accessToken: string }>('POST', '/auth/login', null, { email, password: PASSWORD })
}

/** A club with an active season, a coach, a team manager and a player with accounts, and a training in three days. */
async function setup() {
  const email = uniqueEmail('expected')
  const session = await verifiedSession(email, 'Ada')
  const club = await call<{ accessToken: string }>('POST', '/club', session.accessToken, { name: 'ASD Expected', acceptDpa: true })
  const admin = club.accessToken
  const team = await call<{ id: string }>('POST', '/teams', admin, { name: 'Under 12', sportProfile: 'football' })
  const season = await call<{ id: string }>('POST', `/teams/${team.id}/seasons`, admin, { name: 'Ora', startDate: day(-30), endDate: day(300) })

  const withAccount = async (name: string, surname: string, type: 'player' | 'staff') => {
    const mail = `${name.toLowerCase()}-${email}`
    const user = await verifiedSession(mail, name)
    const person = await call<{ id: string }>('POST', '/people', admin, { name, surname, birthDate: '1990-01-01', email: mail })
    await call('POST', `/seasons/${season.id}/enrollments`, admin, { personId: person.id, type, ...(type === 'staff' ? { staffRoleId: await staffRoleId(admin, 'Allenatore') } : {}) })
    if (type === 'player') await call('POST', `/people/${person.id}/certificates`, admin, { type: 'competitive', issueDate: day(-5), expiryDate: day(300) })
    await call('POST', '/invitations', admin, { email: mail, role: type, personId: person.id })
    await call('POST', '/invitations/accept', user.accessToken, { token: await tokenFromOutbox(mail) })
    return mail
  }
  const coach = await withAccount('Carlo', 'Neri', 'staff')
  const player = await withAccount('Bruno', 'Verdi', 'player')
  const manager = `marta-${email}`
  const managerSession = await verifiedSession(manager, 'Marta')
  await call('POST', '/invitations', admin, { email: manager, role: 'manager', scope: 'team', teamId: team.id })
  const managerToken = (await call<{ accessToken: string }>('POST', '/invitations/accept', managerSession.accessToken, { token: await tokenFromOutbox(manager) })).accessToken
  await call('POST', `/seasons/${season.id}/active`, admin)
  const event = await call<{ id: string }>('POST', `/teams/${team.id}/events`, admin, { type: 'training', start: `${day(3)}T16:00:00Z`, end: `${day(3)}T17:30:00Z` })
  return { coach, player, managerToken, seasonId: season.id, eventId: event.id }
}

async function switchTo(page: Page, email: string, name: string) {
  await page.evaluate(() => localStorage.clear())
  await login(page, email)
  await expect(page.getByRole('heading', { name: `Ciao, ${name}` })).toBeVisible()
}

const PROBABLY = /Probabile infortunato, rientro previsto il/

test('staff record an expected injury: a warning for staff and the player, nothing for the manager, confirming blocks (#21)', async ({ page }) => {
  const { coach, player, managerToken, seasonId, eventId } = await setup()

  await login(page, coach)
  await expect(page.getByRole('heading', { name: 'Ciao, Carlo' })).toBeVisible()
  await go(page, `/team-roster/${seasonId}`)
  const bruno = page.getByRole('listitem').filter({ hasText: 'Bruno Verdi' })
  await bruno.getByRole('button', { name: 'Infortunio previsto' }).click()
  const modal = page.getByRole('dialog', { name: 'Infortunio previsto' })
  await modal.getByLabel('Dal').fill(day(0))
  await modal.getByLabel('Rientro previsto').fill(day(10))
  await modal.getByRole('button', { name: 'Salva' }).click()
  await expect(modal).toBeHidden()
  await expect(bruno.getByText(PROBABLY)).toBeVisible()
  await expect(bruno.getByRole('button', { name: 'Conferma infortunio' })).toBeVisible()

  // The call-up keeps the player callable, with a warning.
  await go(page, `/events/${eventId}/callup`)
  await page.getByRole('tab', { name: /Convocabili/ }).click()
  await expect(page.getByText(PROBABLY)).toBeVisible()

  // The manager of the team never sees the injury. Checked through the API: the login limit (10 a minute) is shared with the other specs.
  type Lists = Record<'calledUp' | 'callable' | 'notCallable', Array<{ reasons: Array<{ code: string }> }>>
  const forManager = await call<Lists>('GET', `/events/${eventId}/callups`, managerToken)
  const managerCodes = [...forManager.calledUp, ...forManager.callable, ...forManager.notCallable].flatMap(r => r.reasons.map(x => x.code))
  expect(forManager.callable).toHaveLength(1)
  expect(managerCodes).not.toContain('probably_injured')

  // The player reads the own expected period.
  await switchTo(page, player, 'Bruno')
  await go(page, '/absences')
  await expect(page.getByText(/Lo staff prevede che tu sia fuori dal/)).toBeVisible()

  // Confirming replaces the period with the injured state.
  await switchTo(page, coach, 'Carlo')
  await go(page, `/team-roster/${seasonId}`)
  await bruno.getByRole('button', { name: 'Conferma infortunio' }).click()
  await expect(bruno.getByText('Infortunato', { exact: true })).toBeVisible()
  await expect(bruno.getByText(PROBABLY)).toHaveCount(0)
  await expect(bruno.getByRole('button', { name: 'Segna disponibile' })).toBeVisible()
})
