import type { CalendarEntryDto, CalendarSeasonDto } from '../types/api'

/** Read only calendar views (slice 3). Writes to events are in `useEvents`. */
export function useCalendar() {
  const api = useApi()
  return {
    /** Personal calendar: events of every team the person is enrolled in, all seasons. */
    mine: () => api<CalendarEntryDto[]>('/calendar/me'),
    /** Team seasons whose calendar the person can open. */
    seasons: () => api<CalendarSeasonDto[]>('/calendar/teams'),
    /** Next event for the home. The API answers an empty body when nothing is coming. */
    next: async () => (await api<CalendarEntryDto | null | ''>('/calendar/next')) || null,
  }
}
