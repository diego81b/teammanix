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

/** A club with an active season, a coach and a player with an account, a player without one, and three recorded trainings. */
async function setup() {
  const email = uniqueEmail('stats')
  const session = await verifiedSession(email, 'Ada')
  const club = await call<{ accessToken: string }>('POST', '/club', session.accessToken, { name: 'ASD Stats', acceptDpa: true })
  const admin = club.accessToken
  const team = await call<{ id: string }>('POST', '/teams', admin, { name: 'Under 12', sportProfile: 'football' })
  const season = await call<{ id: string }>('POST', `/teams/${team.id}/seasons`, admin, { name: 'Ora', startDate: day(-30), endDate: day(300) })

  const withAccount = async (name: string, surname: string, type: 'player' | 'staff') => {
    const mail = `${name.toLowerCase()}-${email}`
    const user = await verifiedSession(mail, name)
    const person = await call<{ id: string }>('POST', '/people', admin, { name, surname, birthDate: '1990-01-01', email: mail })
    const enrollment = await call<{ id: string }>('POST', `/seasons/${season.id}/enrollments`, admin, { personId: person.id, type, ...(type === 'staff' ? { staffRole: 'coach' } : {}) })
    await call('POST', '/invitations', admin, { email: mail, role: type, personId: person.id })
    await call('POST', '/invitations/accept', user.accessToken, { token: await tokenFromOutbox(mail) })
    return { mail, enrollmentId: enrollment.id }
  }
  const coach = await withAccount('Carlo', 'Neri', 'staff')
  const bruno = await withAccount('Bruno', 'Verdi', 'player')
  const dario = await call<{ id: string }>('POST', '/people', admin, { name: 'Dario', surname: 'Bianchi', birthDate: '2014-03-04', email: `dario-${email}` })
  const darioEnrollment = await call<{ id: string }>('POST', `/seasons/${season.id}/enrollments`, admin, { personId: dario.id, type: 'player' })
  await call('POST', `/seasons/${season.id}/active`, admin)

  const marks: [string, string][] = [['present', 'injured'], ['late', 'absent'], ['absent', 'present']]
  for (const [i, [b, d]] of marks.entries()) {
    const ev = await call<{ id: string }>('POST', `/teams/${team.id}/events`, admin, { type: 'training', start: `${day(-5 + i)}T16:00:00Z`, end: `${day(-5 + i)}T17:30:00Z` })
    await call('PUT', `/events/${ev.id}/attendance/${bruno.enrollmentId}`, admin, { outcome: b })
    await call('PUT', `/events/${ev.id}/attendance/${darioEnrollment.id}`, admin, { outcome: d })
  }
  return { coach, bruno, seasonId: season.id }
}

test('the coach reads the season statistics of the team and the player only their own (#20)', async ({ page }) => {
  const { coach, bruno, seasonId } = await setup()

  await login(page, coach.mail)
  await expect(page.getByRole('heading', { name: 'Ciao, Carlo' })).toBeVisible()
  await go(page, `/statistics/${seasonId}`)
  await expect(page.getByRole('heading', { name: 'Statistiche della stagione' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Totali della squadra' })).toBeVisible()
  const bruno1 = page.getByRole('listitem', { name: 'Statistiche di Bruno Verdi' })
  await expect(bruno1.getByText('Presenze', { exact: true })).toBeVisible()
  await expect(bruno1).toContainText('Ritardi')
  // Bruno: present, late, absent -> attended 2 of 3 events = 67%.
  await expect(bruno1).toContainText('67%')
  await expect(page.getByRole('listitem', { name: 'Statistiche di Dario Bianchi' })).toContainText('Eventi saltati per infortunio')

  // The player of the team: own figures, no teammate, no totals.
  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())
  await login(page, bruno.mail)
  await expect(page.getByRole('heading', { name: 'Ciao, Bruno' })).toBeVisible()
  await go(page, '/statistics')
  await expect(page.getByRole('heading', { name: 'Le mie statistiche' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Under 12 · Ora' })).toContainText('67%')
  await expect(page.getByText('Dario Bianchi')).toHaveCount(0)

  // Opening the season page as a player shows the own row only.
  await go(page, `/statistics/${seasonId}`)
  await expect(page.getByRole('region', { name: 'Le tue cifre' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Totali della squadra' })).toHaveCount(0)
  await expect(page.getByText('Dario Bianchi')).toHaveCount(0)
})
