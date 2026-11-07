import { expect, test } from '@playwright/test'
import { go } from './helpers'

test('switching language translates the interface and persists after reload', async ({ page }) => {
  await go(page, '/login')
  await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible()

  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.reload()
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByRole('button', { name: 'Français' }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
})
