import { expect, test } from '@playwright/test'
import { login, uniqueEmail, registerAndVerify } from './helpers'

test('registration, email verification, login, club creation', async ({ page }) => {
  const email = uniqueEmail('path')
  await registerAndVerify(page, email, 'Ada')

  await login(page, email)
  await expect(page).toHaveURL(/\/benvenuto/)

  await page.getByRole('link', { name: 'Crea la tua società' }).click()
  await page.getByRole('textbox', { name: /^Nome della società/ }).fill('ASD E2E')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Crea la società' }).click()

  await expect(page.getByRole('heading', { name: 'Ciao, Ada' })).toBeVisible()
})

test('without a session private pages redirect to login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('wrong credentials: translated message, no server detail', async ({ page }) => {
  await login(page, uniqueEmail('inesistente'))
  await expect(page.getByText('Email o password non corrette.')).toBeVisible()
})
