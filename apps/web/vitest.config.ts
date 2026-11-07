import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

/**
 * - unit: plain TypeScript (utils, language parity, API contract). Node, no Nuxt, seconds.
 * - nuxt: store, composables, components and middleware inside the Nuxt runtime (happy-dom).
 */
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      await defineVitestProject({
        test: { name: 'nuxt', include: ['tests/nuxt/**/*.test.ts'], environment: 'nuxt', hookTimeout: 120000, testTimeout: 60000 },
      }),
    ],
    coverage: { provider: 'v8', include: ['app/**/*.{ts,vue}'], exclude: ['app/pages/terms.vue', 'app/pages/privacy.vue', 'app/pages/dpa.vue'] },
  },
})
