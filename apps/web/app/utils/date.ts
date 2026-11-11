const LOCALE: Record<string, string> = { it: 'it-IT', en: 'en-GB', fr: 'fr-FR' }

/** ISO date (or timestamp) in locale format, always in UTC: "2026-09-01" stays September 1st everywhere. */
export function formatDate(iso: string | null | undefined, language: string): string {
  if (!iso) return '-'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat(LOCALE[language] ?? 'it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d)
}

/** Local day `YYYY-MM-DD` as weekday, day and month ("martedì 6 ottobre"). */
export function formatDay(day: string, language: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '-'
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat(LOCALE[language] ?? 'it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d).replace(',', '')
}

/** Local day `YYYY-MM-DD` as a short weekday, day and short month ("gio 3 dic"), for a list of days. */
export function formatShortDay(day: string, language: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '-'
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat(LOCALE[language] ?? 'it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d).replace(',', '')
}

/** Month and year ("ottobre 2026"). `month` is 1 to 12. */
export function formatMonth(m: { year: number, month: number }, language: string): string {
  const d = new Date(Date.UTC(m.year, m.month - 1, 1))
  return new Intl.DateTimeFormat(LOCALE[language] ?? 'it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}

/** Short weekday names, Monday first. 2026-10-05 is a Monday. */
export function weekdayLabels(language: string): string[] {
  const f = new Intl.DateTimeFormat(LOCALE[language] ?? 'it-IT', { weekday: 'short', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 9, 5 + i))))
}
