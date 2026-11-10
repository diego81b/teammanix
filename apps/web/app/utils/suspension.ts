import type { CoveredMatch, EnrollmentType, SeasonSuspension, SuspensionFormKind, SuspensionOut } from '../types/api'

/** Same limit as the API. */
export const MAX_MATCHES = 99

export interface SuspensionDraft {
  form: SuspensionFormKind
  startDate: string
  matchCount: number | null
  endDate: string
  competitions: string[]
}

export type SuspensionFormError = 'startRequired' | 'countInvalid' | 'endRequired' | 'endBeforeStart' | 'outsideSeason'

/**
 * What stops the form before it is sent. The API checks again and stays the authority. Days are `YYYY-MM-DD`, so they
 * compare as strings. A field of the other form (an end typed before switching to matches) is ignored.
 */
export function suspensionError(d: SuspensionDraft, season: { seasonStart: string, seasonEnd: string }): SuspensionFormError | null {
  if (!d.startDate) return 'startRequired'
  if (d.form === 'matches') {
    if (d.matchCount === null || !Number.isInteger(d.matchCount) || d.matchCount < 1 || d.matchCount > MAX_MATCHES) return 'countInvalid'
  }
  else {
    if (!d.endDate) return 'endRequired'
    if (d.endDate < d.startDate) return 'endBeforeStart'
  }
  if (d.startDate < season.seasonStart || d.startDate > season.seasonEnd) return 'outsideSeason'
  if (d.form === 'period' && d.endDate > season.seasonEnd) return 'outsideSeason'
  return null
}

export type SuspensionBody = {
  form: SuspensionFormKind
  /** Left out when born from a match: the API takes the start from the match. */
  startDate?: string
  matchCount?: number
  endDate?: string
  competitions?: string[]
  originEventId?: string
}

/**
 * The body for the API. A period has no count and no competitions (it covers every match); matches have no end.
 * With an origin match the count starts from the next match: the API takes the start from the match, so none is sent.
 */
export function suspensionPayload(d: SuspensionDraft, originEventId?: string): SuspensionBody {
  if (d.form === 'period') return { form: 'period', startDate: d.startDate, endDate: d.endDate }
  return {
    form: 'matches',
    matchCount: d.matchCount as number,
    competitions: [...d.competitions],
    ...(originEventId ? { originEventId } : { startDate: d.startDate }),
  }
}

const key = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase()

/** Adds a competition once: same name ignoring case and extra spaces. An empty name changes nothing. */
export function addCompetition(chosen: readonly string[], name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean || chosen.some(c => key(c) === key(clean))) return [...chosen]
  return [...chosen, clean]
}

export const removeCompetition = (chosen: readonly string[], name: string): string[] => chosen.filter(c => c !== name)

/** The names already used in the season that are not chosen yet. */
export const suggestions = (used: readonly string[], chosen: readonly string[]): string[] => {
  const taken = new Set(chosen.map(key))
  return used.filter(u => !taken.has(key(u)))
}

/** Matches served out of the matches the suspension covers now (the count for a suspension by matches). */
export function progress(s: Pick<SeasonSuspension, 'form' | 'matchCount' | 'covered' | 'served'>): { served: number, total: number } {
  return { served: s.served, total: s.form === 'matches' ? (s.matchCount as number) : s.covered.length }
}

/** Open ones first by start day, completed ones after, most recent first. */
export function splitSuspensions<T extends Pick<SeasonSuspension, 'id' | 'startDate' | 'completed'>>(list: readonly T[]): { open: T[], completed: T[] } {
  const byStart = (a: T, b: T) => a.startDate.localeCompare(b.startDate)
  return {
    open: list.filter(s => !s.completed).sort(byStart),
    completed: list.filter(s => s.completed).sort((a, b) => byStart(b, a)),
  }
}

/** Fewer matches left first. */
export const byUrgency = (a: Pick<SeasonSuspension, 'remaining'>, b: Pick<SeasonSuspension, 'remaining'>): number => a.remaining - b.remaining

/** The number of the first covered match not played yet, or null when none is left. */
export const nextMatchNumber = (covered: readonly CoveredMatch[]): number | null => covered.find(c => !c.served)?.number ?? null

/** A suspension can be recorded on a live enrollment of an active person. The API checks the season state again. */
export const canSuspendOn = (enrollment: { endedAt: string | null }, personDisabled: boolean): boolean => !enrollment.endedAt && !personDisabled

/** A suspension read from one enrollment, in the shape of the team list, so the form edits it the same way. */
export const forPerson = (s: SuspensionOut, p: { id: string, name: string, surname: string | null, type: EnrollmentType }): SeasonSuspension => ({
  ...s, personId: p.id, name: p.name, surname: p.surname, type: p.type,
})
