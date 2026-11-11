import type { AbsenceOut, AbsenceResult, MyEnrollmentAbsences, SeasonAbsences } from '../types/api'

/**
 * Declared absences (rule 10). The person concerned is the only one who writes; the API decides and checks again.
 * `endDate: null` means "until further notice".
 */
export function useAbsences() {
  const api = useApi()
  return {
    /** The logged in person's open enrollments with their absences. */
    mine: () => api<MyEnrollmentAbsences[]>('/absences/me'),
    /** Who is away in the team, dates only. Staff of the season, managers in scope and the admin; never a player. */
    ofSeason: (seasonId: string) => api<SeasonAbsences[]>(`/seasons/${seasonId}/absences`),
    create: (enrollmentId: string, period: { startDate: string, endDate: string | null }) =>
      api<AbsenceResult>(`/enrollments/${enrollmentId}/absences`, { method: 'POST', body: period }),
    update: (id: string, period: { startDate: string, endDate: string | null }) =>
      api<AbsenceResult>(`/absences/${id}`, { method: 'PATCH', body: period }),
    remove: (id: string) => api<void>(`/absences/${id}`, { method: 'DELETE' }),
    /**
     * Frees days from today onward in the person's own absences: the API shortens, splits or removes every period the range
     * touches and answers with the new list. `endDate: null` frees from `startDate` onward.
     */
    free: (enrollmentId: string, range: { startDate: string, endDate: string | null }) =>
      api<{ absences: AbsenceOut[] }>(`/enrollments/${enrollmentId}/absences/free`, { method: 'POST', body: range }),
    /** Declines exactly the events listed, which must fall in the absence. Nothing else is touched. */
    decline: (id: string, eventIds: string[]) =>
      api<{ declined: string[] }>(`/absences/${id}/decline`, { method: 'POST', body: { eventIds } }),
  }
}
