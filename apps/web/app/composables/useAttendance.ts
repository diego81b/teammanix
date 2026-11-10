import type { AttendanceDto, AttendanceOutcome } from '../types/api'

/**
 * Attendance of an event (slice 5). Reads follow the role; writes need `attendances.record` in the team and the API decides.
 * The outcome comes from a closed list, there is no free note.
 */
export function useAttendance() {
  const api = useApi()
  return {
    view: (eventId: string) => api<AttendanceDto>(`/events/${eventId}/attendance`),
    record: (eventId: string, enrollmentId: string, outcome: AttendanceOutcome) =>
      api<{ enrollmentId: string, outcome: AttendanceOutcome }>(`/events/${eventId}/attendance/${enrollmentId}`, { method: 'PUT', body: { outcome } }),
    clear: (eventId: string, enrollmentId: string) =>
      api<void>(`/events/${eventId}/attendance/${enrollmentId}`, { method: 'DELETE' }),
  }
}
