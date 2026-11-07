import type { RosterRow, SeasonDto, SeasonStatus } from '../types/api'
import type { VariantBadge } from './certificate'

const validDate = (iso: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

export const validatePeriod = (start: string, end: string): boolean => validDate(start) && validDate(end) && end >= start

/** Same date one year later; February 29 becomes February 28. */
function aYearAfter(iso: string): string {
  const [a, m, g] = iso.split('-') as [string, string, string]
  const year = Number(a) + 1
  const d = new Date(Date.UTC(year, Number(m) - 1, Number(g)))
  return d.getUTCMonth() === Number(m) - 1 ? d.toISOString().slice(0, 10) : `${year}-${m}-28`
}

const startProposed = (data: string): string => (data.slice(5) > '07-01' ? `${data.slice(0, 4)}-07-01` : data)

/**
 * Proposal for the next season: a name like "2025/2026" advances by a year, other names stay.
 * The start falls on July 1 (preparation at end of August, league in mid September), unless the start
 * of the previous one was already in July or earlier.
 */
export function proposeNewSeason(s: Pick<SeasonDto, 'name' | 'startDate' | 'endDate'>): { name: string, startDate: string, endDate: string } {
  const template = /^(\d{4})\/(\d{4})$/.exec(s.name)
  return {
    name: template ? `${Number(template[1]) + 1}/${Number(template[2]) + 1}` : s.name,
    startDate: startProposed(aYearAfter(s.startDate)),
    endDate: aYearAfter(s.endDate),
  }
}

export const selectionInitial = (roster: readonly RosterRow[]): string[] => roster.map((r) => r.id)

export const toggleSelection = (choices: readonly string[], id: string): string[] =>
  choices.includes(id) ? choices.filter((x) => x !== id) : [...choices, id]

export function seasonStatusItem(status: SeasonStatus): VariantBadge {
  return status === 'active' ? 'success' : status === 'draft' ? 'warning' : 'neutral'
}
