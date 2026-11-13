import type { EventDto, OpponentDto, SeriesDto, SeriesRemovalDto, VenueDto } from '../types/api'
import type { EventPayload } from '../utils/event'
import type { SeriesCreatePayload, SeriesEditPayload } from '../utils/series'

/** Events, venues and opponents (slice 3). Writes need `events.manage` in the team; the API decides. */
export function useEvents() {
  const api = useApi()
  return {
    list: (seasonId: string) => api<EventDto[]>(`/seasons/${seasonId}/events`),
    /** The team of the season and whether the person can plan events in it now, to show or hide the actions. */
    access: (seasonId: string) => api<{ teamId: string, canManage: boolean, canSuspend: boolean, canSeeAbsences: boolean, canSeeCertificates: boolean, canSeeRoster: boolean, canSeeStatistics: boolean }>(`/seasons/${seasonId}/events-access`),
    competitions: (seasonId: string) => api<string[]>(`/seasons/${seasonId}/competitions`),
    venues: () => api<VenueDto[]>('/venues'),
    opponents: (teamId: string) => api<OpponentDto[]>(`/teams/${teamId}/opponents`),
    create: (teamId: string, data: EventPayload) =>
      api<EventDto>(`/teams/${teamId}/events`, { method: 'POST', body: { ...data } }),
    edit: (id: string, data: Partial<EventPayload>) =>
      api<EventDto>(`/events/${id}`, { method: 'PATCH', body: { ...data } }),
    /** Recurring trainings: the API creates the real events. */
    createSeries: (teamId: string, data: SeriesCreatePayload) =>
      api<SeriesDto>(`/teams/${teamId}/series`, { method: 'POST', body: { ...data } }),
    series: (id: string) => api<SeriesDto>(`/series/${id}`),
    /** "All future ones". "Only this one" is `edit` on the event. */
    editSeries: (id: string, data: SeriesEditPayload) =>
      api<SeriesDto>(`/series/${id}`, { method: 'PATCH', body: { ...data } }),
    /** The numbers the removal of the future sessions would give. Nothing changes. */
    removalPreview: (id: string) => api<SeriesRemovalDto>(`/series/${id}/future-sessions`),
    /** Removes the sessions whose attendance check has not opened and ends the series before them. */
    removeFuture: (id: string) => api<SeriesRemovalDto>(`/series/${id}/future-sessions`, { method: 'DELETE' }),
    cancel: (id: string) => api<EventDto>(`/events/${id}/cancel`, { method: 'POST', body: {} }),
    postpone: (id: string) => api<EventDto>(`/events/${id}/postpone`, { method: 'POST', body: {} }),
    createVenue: (data: { name: string, address?: string }) =>
      api<VenueDto>('/venues', { method: 'POST', body: { ...data } }),
    editVenue: (id: string, data: { name?: string, address?: string | null }) =>
      api<VenueDto>(`/venues/${id}`, { method: 'PATCH', body: { ...data } }),
  }
}
