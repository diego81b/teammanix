import type { AbsenceResult, MyEnrollmentAbsences } from '../types/api'

/**
 * Declared absences (rule 10). The person concerned is the only one who writes; the API decides and checks again.
 * `endDate: null` means "until further notice".
 */
export function useAbsences() {
  const api = useApi()
  return {
    /** The logged in person's open enrollments with their absences. */
    mine: () => api<MyEnrollmentAbsences[]>('/absences/me'),
    create: (enrollmentId: string, period: { startDate: string, endDate: string | null }) =>
      api<AbsenceResult>(`/enrollments/${enrollmentId}/absences`, { method: 'POST', body: period }),
    update: (id: string, period: { startDate: string, endDate: string | null }) =>
      api<AbsenceResult>(`/absences/${id}`, { method: 'PATCH', body: period }),
    remove: (id: string) => api<void>(`/absences/${id}`, { method: 'DELETE' }),
    /** Declines exactly the events listed, which must fall in the absence. Nothing else is touched. */
    decline: (id: string, eventIds: string[]) =>
      api<{ declined: string[] }>(`/absences/${id}/decline`, { method: 'POST', body: { eventIds } }),
  }
}
