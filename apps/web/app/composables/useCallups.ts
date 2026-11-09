import type { AnswerChange, AnswerResult, CallupResponse, CallupRow, CallupsDto, Placement, ReasonDecline } from '../types/api'

/**
 * Call-up of an event (slice 4). Reads follow the role (players get only who is called up); writes need
 * `callups.manage` in the team and the API decides.
 */
export function useCallups() {
  const api = useApi()
  return {
    lists: (eventId: string) => api<CallupsDto>(`/events/${eventId}/callups`),
    /** `confirm` only after the coach accepted a confirmation (declared absence). It never overrides a hard block. */
    add: (eventId: string, enrollmentId: string, confirm = false) =>
      api<CallupRow>(`/events/${eventId}/callups`, { method: 'POST', body: { enrollmentId, ...(confirm ? { confirm: true } : {}) } }),
    remove: (eventId: string, enrollmentId: string) =>
      api<void>(`/events/${eventId}/callups/${enrollmentId}`, { method: 'DELETE' }),
    placement: (eventId: string, enrollmentId: string, placement: Placement | null) =>
      api<CallupRow>(`/events/${eventId}/callups/${enrollmentId}`, { method: 'PATCH', body: { placement } }),
    /** Marks as sent the call-ups not sent yet and returns who they are. */
    send: (eventId: string) =>
      api<{ notified: { enrollmentId: string, personId: string }[] }>(`/events/${eventId}/callups/send`, { method: 'POST', body: {} }),
    /** The called-up player answers. A decline needs a reason from the closed list. */
    answer: (eventId: string, response: Exclude<CallupResponse, 'pending'>, reason?: ReasonDecline) =>
      api<AnswerResult>(`/events/${eventId}/callups/me`, { method: 'PUT', body: { response, ...(reason ? { reason } : {}) } }),
    /** A staff member declares available or not available for the event. No reason, no call-up needed. */
    availability: (eventId: string, response: Exclude<CallupResponse, 'pending'>) =>
      api<AnswerResult>(`/events/${eventId}/availability/me`, { method: 'PUT', body: { response } }),
    /** The trail of changes of one person's answer, with dates. Staff, managers and the admin only. */
    history: (eventId: string, enrollmentId: string) =>
      api<{ changes: AnswerChange[] }>(`/events/${eventId}/callups/${enrollmentId}/history`),
  }
}
