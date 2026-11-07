const LOCALE: Record<string, string> = { it: 'it-IT', en: 'en-GB', fr: 'fr-FR' }

/** ISO date (or timestamp) in locale format, always in UTC: "2026-09-01" stays September 1st everywhere. */
export function formatDate(iso: string | null | undefined, language: string): string {
  if (!iso) return '-'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat(LOCALE[language] ?? 'it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d)
}
