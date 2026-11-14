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

/** Last token received by email: the verification right after a registration, the invitation right after an invite. */
async function tokenFromOutbox(email: string): Promise<string> {
  let token: string | undefined
  await expect.poll(async () => {
    const mails = (await (await fetch(`${API}/__test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ text: string }>
    token = mails.at(-1) && /token=(\S+)/.exec(mails.at(-1)!.text)?.[1]
    return token
  }).toBeTruthy()
  return token!
}

/** Registers and verifies a user through the API and returns the session. */
async function verifiedSession(email: string, name = 'Ada') {
  await call('POST', '/auth/registration', null, { email, password: PASSWORD, name, surname: 'Rossi', acceptTerms: true })
  await call('POST', '/auth/verify-email', null, { token: await tokenFromOutbox(email) })
  return call<{ accessToken: string }>('POST', '/auth/login', null, { email, password: PASSWORD })
}

/** An admin with a club that has no teams and no sections. */
async function newClub(prefix: string) {
  const email = uniqueEmail(prefix)
  const session = await verifiedSession(email)
  const club = await call<{ accessToken: string }>('POST', '/club', session.accessToken, { name: `ASD ${prefix}`, acceptDpa: true })
  return { email, admin: club.accessToken }
}

/** A team with an active season, so that it shows in the calendars. */
async function teamWithSeason(admin: string, name: string, sectionId?: string, sport = 'football', activate = true) {
  const team = await call<{ id: string }>('POST', '/teams', admin, { name, sportProfile: sport, ...(sectionId ? { sectionId } : {}) })
  const season = await call<{ id: string }>('POST', `/teams/${team.id}/seasons`, admin, { name: 'Ora', startDate: day(-30), endDate: day(300) })
  if (activate) await call('POST', `/seasons/${season.id}/active`, admin)
  return { teamId: team.id, seasonId: season.id }
}

test('an admin creates a team in a club without sections: no section anywhere', async ({ page }) => {
  const { email } = await newClub('structure')
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  await go(page, '/structure')
  await expect(page.getByText('Nessuna squadra', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nuova squadra' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuova squadra' })
  // The club has no sections: the form does not offer one.
  await expect(dialog.getByRole('combobox', { name: /^Settore/ })).toHaveCount(0)
  await dialog.getByRole('combobox', { name: /^Sport/ }).click()
  await page.getByRole('option', { name: 'Calcio', exact: true }).click()
  await dialog.getByRole('textbox', { name: /^Nome/ }).fill('Under 15')
  await dialog.getByRole('button', { name: 'Crea' }).click()

  await expect(page.getByRole('heading', { name: 'Under 15', level: 3 })).toBeVisible()
  await expect(page.getByText('Senza settore')).toHaveCount(0)
})

test('a section manager sees a team added to the section after they were invited', async ({ page }) => {
  const { admin } = await newClub('section')
  const section = await call<{ id: string }>('POST', '/sections', admin, { name: 'Calcio' })
  await teamWithSeason(admin, 'Under 12', section.id)

  const managerEmail = uniqueEmail('manager')
  const manager = await verifiedSession(managerEmail, 'Mara')
  await call('POST', '/invitations', admin, { email: managerEmail, role: 'manager', scope: 'section', sectionId: section.id })
  await call('POST', '/invitations/accept', manager.accessToken, { token: await tokenFromOutbox(managerEmail) })

  // Added after the invitation was accepted, and one outside the section that must stay out of reach.
  await teamWithSeason(admin, 'Under 14', section.id)
  await teamWithSeason(admin, 'Prima squadra')

  await login(page, managerEmail)
  await expect(page.getByRole('heading', { name: 'Ciao, Mara' })).toBeVisible()
  await go(page, '/calendar')
  const switcher = page.getByRole('combobox', { name: 'Calendario' })
  await expect(switcher).toContainText('Under')
  // The list can re-render while the data settles and close the menu: open it again until both teams show.
  await expect(async () => {
    if (!(await page.getByRole('listbox').isVisible())) await switcher.click()
    await expect(page.getByRole('option', { name: /^Under 12/ })).toBeVisible({ timeout: 2_000 })
    await expect(page.getByRole('option', { name: /^Under 14/ })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByRole('option', { name: /^Prima squadra/ })).toHaveCount(0)
})

test('a club of fencing groups says group, a mixed club says team', async ({ page }) => {
  const { email, admin } = await newClub('term')
  await teamWithSeason(admin, 'Spada A', undefined, 'fencing')
  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()

  await go(page, '/structure')
  await expect(page.getByRole('button', { name: 'Nuovo gruppo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuova squadra' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Modifica il gruppo Spada A' })).toBeVisible()

  await teamWithSeason(admin, 'Under 15')
  await go(page, '/structure')
  await expect(page.getByRole('button', { name: 'Nuova squadra' })).toBeVisible()
  // The dialog follows the sport that is picked: fencing talks about a group, football about a team.
  await page.getByRole('button', { name: 'Nuova squadra' }).click()
  await page.getByRole('dialog').getByRole('combobox', { name: /^Sport/ }).click()
  await page.getByRole('option', { name: 'Scherma', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Nuovo gruppo' })).toBeVisible()
})

test('an admin enrolls a person as staff in three teams at once, then the teams are taken', async ({ page }) => {
  const { email, admin } = await newClub('staff')
  const section = await call<{ id: string }>('POST', '/sections', admin, { name: 'Calcio' })
  await teamWithSeason(admin, 'Under 12', section.id)
  // Only a draft season: the person goes into it.
  await teamWithSeason(admin, 'Under 14', section.id, 'football', false)
  await teamWithSeason(admin, 'Prima squadra')
  const person = await call<{ id: string }>('POST', '/people', admin, { name: 'Luca', surname: 'Bianchi', email: uniqueEmail('luca') })

  await login(page, email)
  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()
  await go(page, `/people/${person.id}`)
  await page.getByRole('button', { name: 'Iscrivi in più squadre' }).click()
  const dialog = page.getByRole('dialog', { name: 'Iscrivi in più squadre' })

  // Nothing picked: refused with the reason.
  await dialog.getByRole('button', { name: 'Iscrivi' }).click()
  await expect(dialog.getByText('Scegli almeno una squadra')).toBeVisible()

  // Filtered by section: only its two teams.
  await dialog.getByRole('combobox', { name: /^Settore/ }).click()
  await page.getByRole('option', { name: 'Calcio', exact: true }).click()
  await expect(dialog.getByRole('checkbox', { name: /Prima squadra/ })).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: /Under 12/ }).check()
  await dialog.getByRole('checkbox', { name: /Under 14/ }).check()

  // Back to every team: the choice stays and the third one can be added.
  await dialog.getByRole('combobox', { name: /^Settore/ }).click()
  await page.getByRole('option', { name: 'Tutti i settori' }).click()
  await dialog.getByRole('checkbox', { name: /Prima squadra/ }).check()
  await dialog.getByRole('button', { name: 'Iscrivi' }).click()
  await expect(dialog).toBeHidden()

  const rows = page.getByRole('table').getByRole('row')
  await expect(rows).toHaveCount(4)
  await expect(page.getByRole('table')).toContainText('Calcio · Under 12')
  await expect(page.getByRole('table')).toContainText('Calcio · Under 14')
  await expect(page.getByRole('table')).toContainText('Prima squadra')

  // Reopened: the three teams are already staff and cannot be picked again.
  await page.getByRole('button', { name: 'Iscrivi in più squadre' }).click()
  const again = page.getByRole('dialog', { name: 'Iscrivi in più squadre' })
  await expect(again.getByRole('checkbox', { name: /Under 12/ })).toBeDisabled()
  await expect(again.getByText('Già nello staff')).toHaveCount(3)
})
