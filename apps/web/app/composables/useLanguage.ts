import type { Language } from '~/types/api'

/**
 * Language change. Startup precedence (plugin lingua.client.ts): Utente.lingua > saved choice > browser > Italian.
 * When authenticated the choice also goes to the API, because emails and notifications follow Utente.lingua.
 */
export function useLanguage() {
  const { locale, setLocale } = useI18n()
  const session = useSessionStore()
  const api = useApi()

  /** Applies the language to the interface. `salva: false` to use it as a default without fixing it as the choice (e.g. invitation language). */
  async function apply(l: Language, save = true) {
    if (locale.value !== l) await setLocale(l)
    if (save) saveLanguage(l)
  }

  async function set(l: Language) {
    await apply(l)
    if (!session.authenticated || session.user?.language === l) return
    try {
      const r = await api<{ language: Language }>('/auth/language', { method: 'PATCH', body: { language: l } })
      session.setLanguage(r.language)
    }
    catch { /* the interface has already changed; the server realigns at the next change or at login */ }
  }

  return { locale, languages: LANGUAGES, apply, set }
}
