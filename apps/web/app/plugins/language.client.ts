/**
 * Chooses the language at startup and keeps it aligned with Utente.lingua.
 * Precedence: account language > choice saved in this browser > browser language > Italian.
 * The i18n module detects nothing on its own (detectBrowserLanguage: false), so no extra cookie.
 */
export default defineNuxtPlugin({
  name: 'language',
  dependsOn: ['i18n:plugin', 'pinia'],
  async setup(nuxtApp) {
    const i18n = nuxtApp.$i18n
    const session = useSessionStore()

    const initial = session.user?.language ?? languageSaved() ?? languageOfBrowser() ?? 'it'
    if (i18n.locale.value !== initial) await i18n.setLocale(initial)

    // After login, registration or realignment (auth/me) the account language wins.
    watch(() => session.user?.language, async (l) => {
      if (!l || l === i18n.locale.value) return
      await i18n.setLocale(l)
      saveLanguage(l)
    })
  },
})
