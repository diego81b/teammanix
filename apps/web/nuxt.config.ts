import { fileURLToPath } from 'node:url'
import { loadEnvDev } from './env-dev'

// Development defaults from .env.dev; .env and the shell win (see env-dev.ts).
loadEnvDev(fileURLToPath(new URL('.', import.meta.url)))

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  ssr: false,

  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxt/fonts', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],

  // Languages: Italian (source and fallback), English, French. No prefix in the URL: the app sits behind login.
  // The choice does not use the module cookie: the lingua.client.ts plugin handles it (localStorage, then Utente.lingua).
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'it',
    detectBrowserLanguage: false,
    locales: [
      { code: 'it', language: 'it-IT', name: 'Italian', file: 'it.ts' },
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.ts' },
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.ts' },
    ],
    vueI18n: './i18n.config.ts',
  },

  // The API emails point to APP_URL (default http://localhost:5173) and CORS allows the same origin.
  devServer: { port: 5173 },

  // Theme: follows the system until the user chooses (selector in the profile, slice 6).
  colorMode: { preference: 'system', fallback: 'light' },

  // Icons: only the design system set (mockup/ui/assets/icons.svg, see gen-icons.mjs).
  // No fallback to the Iconify API: no third-party calls (GDPR).
  icon: {
    provider: 'iconify',
    fallbackToApi: false,
    customCollections: [{ prefix: 'tm', dir: './app/assets/icons' }],
    clientBundle: { includeCustomCollections: true },
  },

  // Fonts hosted locally by @nuxt/fonts (downloaded at build), never from Google at runtime.
  fonts: {
    families: [
      { name: 'Inter', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Montserrat', provider: 'google', weights: [500, 600, 700, 800] },
    ],
  },

  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api',
    },
  },

  app: {
    head: {
      title: 'TeamManix',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'TeamManix, la gestione della tua squadra.' },
        { name: 'theme-color', content: '#007A7E' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'TeamManix' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/app-icon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  typescript: { strict: true, typeCheck: false },
})
