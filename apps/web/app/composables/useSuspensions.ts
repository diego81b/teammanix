import type { MyEnrollmentSuspensions, SeasonSuspension, SuspensionContext, SuspensionOut } from '../types/api'
import type { SuspensionBody } from '../utils/suspension'

/**
 * Suspensions (rule 13). The staff with the permission writes, never on themselves; the person concerned, staff, managers
 * and the admin read; teammates never. The API decides and checks again.
 */
export function useSuspensions() {
  const api = useApi()
  return {
    /** The logged in person's open enrollments with their suspensions. */
    mine: () => api<MyEnrollmentSuspensions[]>('/suspensions/me'),
    /** The team's suspensions, with who they are for. Staff, managers and the admin. */
    ofSeason: (seasonId: string) => api<SeasonSuspension[]>(`/seasons/${seasonId}/suspensions`),
    /** One enrollment's suspensions: the person, staff, managers in scope and the admin read them. */
    ofEnrollment: (enrollmentId: string) => api<{ suspensions: SuspensionOut[] }>(`/enrollments/${enrollmentId}/suspensions`).then(r => r.suspensions),
    /** Season dates, who can be suspended and whether the reader may record. */
    context: (seasonId: string) => api<SuspensionContext>(`/seasons/${seasonId}/suspensions-context`),
    create: (enrollmentId: string, body: SuspensionBody) =>
      api<SuspensionOut>(`/enrollments/${enrollmentId}/suspensions`, { method: 'POST', body }),
    /** Replaces the data. The origin match stays only while the form and the start day are the same. */
    update: (id: string, body: Omit<SuspensionBody, 'originEventId'>) =>
      api<SuspensionOut>(`/suspensions/${id}`, { method: 'PATCH', body }),
    cancel: (id: string) => api<void>(`/suspensions/${id}`, { method: 'DELETE' }),
  }
}
