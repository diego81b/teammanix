import type { Language } from '~/types/api'

export const LANGUAGES: readonly Language[] = ['it', 'en', 'fr']

/** Name of each language in the language itself: whoever looks for their own recognizes it even if the interface is in another. */
export const LANGUAGE_NAMES: Record<Language, string> = { it: 'Italiano', en: 'English', fr: 'Français' }

const KEY = 'tm-language'

export function eLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v)
}

/** Choice made in this browser. Not a cookie: it stays on the device and is never sent to the server. */
export function languageSaved(): Language | null {
  try {
    const v = localStorage.getItem(KEY)
    return eLanguage(v) ? v : null
  }
  catch {
    return null
  }
}

export function saveLanguage(l: Language) {
  try {
    localStorage.setItem(KEY, l)
  }
  catch { /* storage unavailable: the choice lasts until the page restarts */ }
}

export function languageOfBrowser(): Language | null {
  for (const l of navigator.languages ?? [navigator.language]) {
    const base = l.slice(0, 2).toLowerCase()
    if (eLanguage(base)) return base
  }
  return null
}
