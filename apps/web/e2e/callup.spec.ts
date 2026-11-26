import { expect, test } from '@playwright/test'
import { call, day, tokenFromOutbox, verifiedSession } from './api'
import { go, login, staffRoleId, uniqueEmail } from './helpers'

/** Registers and verifies an admin through the API, then builds a club with an active season, two players and tomorrow's training. */
async function setup() {
  const email = uniqueEmail('callup')
  const session = await verifiedSession(email)
  const club = await call<{ accessToken: string }>('POST', '/club', session.accessToken, { name: 'ASD Callup', acceptDpa: true })
  const admin = club.accessToken

  const team = await call<{ id: string }>('POST', '/teams', admin, { name: 'Under 12', sportProfile: 'football' })
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
  return { email, eventId: event.id, admin, seasonId: season.id }
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

test('a trainer who also plays answers the call-up as player and declares availability as staff, each on its own (#15)', async ({ page }) => {
  const { email, eventId, admin, seasonId } = await setup()
  const dualEmail = `dual-${email}`
  const user = await verifiedSession(dualEmail, 'Dora')
  const person = await call<{ id: string }>('POST', '/people', admin, { name: 'Dora', surname: 'Neri', birthDate: '1990-01-01', email: dualEmail })
  await call('POST', `/seasons/${seasonId}/enrollments`, admin, { personId: person.id, type: 'staff', staffRoleId: await staffRoleId(admin, 'Preparatore') })
  const player = await call<{ id: string }>('POST', `/seasons/${seasonId}/enrollments`, admin, { personId: person.id, type: 'player' })
  await call('POST', `/people/${person.id}/certificates`, admin, { type: 'competitive', issueDate: day(-5), expiryDate: day(300) })
  await call('POST', '/invitations', admin, { email: dualEmail, role: 'staff', personId: person.id })
  await call('POST', '/invitations/accept', user.accessToken, { token: await tokenFromOutbox(dualEmail) })

  await login(page, dualEmail)
  await expect(page.getByRole('heading', { name: 'Ciao, Dora' })).toBeVisible()
  await go(page, `/events/${eventId}/callup`)
  // Not called up yet: only the staff control.
  await expect(page.getByRole('group', { name: 'La tua disponibilità come staff' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'La tua risposta come giocatore' })).toHaveCount(0)

  await call('POST', `/events/${eventId}/callups`, admin, { enrollmentId: player.id })
  await go(page, `/events/${eventId}/callup`)
  const asPlayer = page.getByRole('group', { name: 'La tua risposta come giocatore' })
  const asStaff = page.getByRole('group', { name: 'La tua disponibilità come staff' })
  await expect(asPlayer).toBeVisible()
  await asPlayer.getByRole('button', { name: 'Ci sono', exact: true }).click()
  await expect(asPlayer.getByRole('button', { name: 'Ci sono', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // The answer as player leaves the availability untouched.
  await expect(asStaff.getByRole('button', { name: 'Disponibile', exact: true })).toHaveAttribute('aria-pressed', 'false')

  await asStaff.getByRole('button', { name: 'Non disponibile', exact: true }).click()
  await expect(asStaff.getByRole('button', { name: 'Non disponibile', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(asPlayer.getByRole('button', { name: 'Ci sono', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
