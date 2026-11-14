import { expect, type Page } from '@playwright/test'

const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api'
export const PASSWORD = 'password-long-123'

/** Opens a page and waits for the app to hydrate: in development, clicks before that moment are lost. */
export async function go(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

/** Unique email per run: the development database is not cleaned. */
export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.test`

/** Id of a role of the club's catalog, by name (a new club gets the Italian defaults: Allenatore, Preparatore, ...). */
export async function staffRoleId(admin: string, name: string): Promise<string> {
  const r = await fetch(`${API}/staff-roles`, { headers: { Authorization: `Bearer ${admin}` } })
  const role = ((await r.json()) as Array<{ id: string, name: string }>).find(x => x.name === name)
  if (!role) throw new Error(`no staff role named ${name}`)
  return role.id
}

/** First link in the last mail received by `to`. Retries until the mail arrives. */
export async function linkFromMail(to: string, subject = ''): Promise<string> {
  let link: string | undefined
  await expect.poll(async () => {
    const r = await fetch(`${API}/__test/outbox?to=${encodeURIComponent(to)}`)
    const mail = ((await r.json()) as Array<{ subject: string, text: string }>).filter(m => m.subject.includes(subject)).at(-1)
    link = mail && /https?:\/\/\S+/.exec(mail.text)?.[0]
    return link
  }, { message: `no mail for ${to}`, timeout: 15_000 }).toBeTruthy()
  return link!
}

export async function registerAndVerify(page: Page, email: string, name = 'Ada') {
  await go(page, '/registration')
  await page.getByLabel('Nome', { exact: true }).fill(name)
  await page.getByLabel('Cognome').fill('Rossi')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('textbox', { name: /^Password/ }).fill(PASSWORD)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Registrati' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await go(page, await linkFromMail(email))
  await expect(page.getByRole('heading', { name: 'Email verificata' })).toBeVisible()
}

export async function login(page: Page, email: string) {
  await go(page, '/login')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('textbox', { name: /^Password/ }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Accedi' }).click()
}
