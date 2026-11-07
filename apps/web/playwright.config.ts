import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against the development environment: web on 5173 (started from here if not already running) and API on 3001
 * with E2E_OUTBOX=1 (enabled in apps/api/.env.dev, see e2e/README). Each test uses unique emails: the
 * dev database needs no cleanup. Uses the installed Chrome, no browser download.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'it-IT',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
