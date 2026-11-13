import type { RosterRow, CertificateStatus, EnrollmentStatus, EnrollmentType, ExpectedPeriod } from '../types/api'

export interface RosterFilters {
  q?: string
  status?: EnrollmentStatus
  certificate?: CertificateStatus
  type?: EnrollmentType
}

export const fullName = (r: Pick<RosterRow, 'name' | 'surname'>): string => [r.name, r.surname].filter(Boolean).join(' ')

/** Roster filters (screen 23). Whoever has no certificate (staff) does not pass a certificate filter. */
export function filterRoster(rows: readonly RosterRow[], f: RosterFilters): RosterRow[] {
  const q = f.q?.trim().toLowerCase()
  return rows.filter((r) => {
    if (q && !fullName(r).toLowerCase().includes(q)) return false
    if (f.type && r.type !== f.type) return false
    if (f.status && r.status !== f.status) return false
    if (f.certificate && r.certificate?.status !== f.certificate) return false
    return true
  })
}

export function countRoster(rows: readonly RosterRow[]): { players: number, staff: number } {
  const players = rows.filter((r) => r.type === 'player').length
  return { players, staff: rows.length - players }
}

/** State a staff member can set on a row (#29): the opposite one, for players only and with `people.manage`. Otherwise no action. */
export function statusAction(r: Pick<RosterRow, 'type' | 'status'>, canSet: boolean): EnrollmentStatus | null {
  if (!canSet || r.type !== 'player') return null
  return r.status === 'injured' ? 'available' : 'injured'
}

/**
 * The expected injury to show on a row (#21): players only, and not once the injury is confirmed (the injured badge says
 * it). The API sends the dates only to who can set the status; everybody else gets null.
 */
export function probablyInjured(r: Pick<RosterRow, 'type' | 'status'> & { expectedInjury?: ExpectedPeriod | null }): ExpectedPeriod | null {
  if (r.type !== 'player' || r.status === 'injured') return null
  return r.expectedInjury ?? null
}

/** The expected period form: both days, the return (first day available again) after the start. The API checks again. */
export function checkExpected(p: ExpectedPeriod): 'ok' | 'required' | 'returnAfterStart' {
  if (!p.startDate || !p.returnDate) return 'required'
  return p.returnDate > p.startDate ? 'ok' : 'returnAfterStart'
}
