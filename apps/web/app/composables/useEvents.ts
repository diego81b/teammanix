import type { EventDto, OpponentDto, VenueDto } from '../types/api'
import type { EventPayload } from '../utils/event'

/** Events, venues and opponents (slice 3). Writes need `events.manage` in the team; the API decides. */
export function useEvents() {
  const api = useApi()
  return {
    list: (seasonId: string) => api<EventDto[]>(`/seasons/${seasonId}/events`),
    /** The team of the season and whether the person can plan events in it now, to show or hide the actions. */
    access: (seasonId: string) => api<{ teamId: string, canManage: boolean }>(`/seasons/${seasonId}/events-access`),
    competitions: (seasonId: string) => api<string[]>(`/seasons/${seasonId}/competitions`),
    venues: () => api<VenueDto[]>('/venues'),
    opponents: (teamId: string) => api<OpponentDto[]>(`/teams/${teamId}/opponents`),
    create: (teamId: string, data: EventPayload) =>
      api<EventDto>(`/teams/${teamId}/events`, { method: 'POST', body: { ...data } }),
    edit: (id: string, data: Partial<EventPayload>) =>
      api<EventDto>(`/events/${id}`, { method: 'PATCH', body: { ...data } }),
    cancel: (id: string) => api<EventDto>(`/events/${id}/cancel`, { method: 'POST', body: {} }),
    postpone: (id: string) => api<EventDto>(`/events/${id}/postpone`, { method: 'POST', body: {} }),
    createVenue: (data: { name: string, address?: string }) =>
      api<VenueDto>('/venues', { method: 'POST', body: { ...data } }),
    editVenue: (id: string, data: { name?: string, address?: string | null }) =>
      api<VenueDto>(`/venues/${id}`, { method: 'PATCH', body: { ...data } }),
  }
}
