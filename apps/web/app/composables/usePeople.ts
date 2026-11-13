import type {
  EnrollmentOut, PersonDetail, PersonDto, RosterRow, StaffRole, EnrollmentStatus, EnrollmentType, TeamRoster,
} from '../types/api'

export interface PersonData {
  name: string
  surname?: string
  birthDate?: string
  email?: string
  phone?: string
}

export interface EnrollmentData {
  personId: string
  type: EnrollmentType
  staffRole?: StaffRole
  position?: string
  jerseyNumber?: number
}

/** Registry, roster and enrollments (screens 23, 24, 26, 35). Admin only. */
export function usePeople() {
  const api = useApi()
  return {
    list: (q = '') => api<PersonDto[]>(q.trim() ? `/people?q=${encodeURIComponent(q.trim())}` : '/people'),
    disabled: () => api<PersonDto[]>('/people/disabled'),
    detail: (id: string) => api<PersonDetail>(`/people/${id}`),
    create: (data: PersonData) => api<PersonDto>('/people', { method: 'POST', body: { ...data } }),
    disable: (id: string) => api<PersonDto>(`/people/${id}/disable`, { method: 'POST', body: {} }),
    reenable: (id: string) => api<PersonDto>(`/people/${id}/reenable`, { method: 'POST', body: {} }),
    roster: (seasonId: string) => api<RosterRow[]>(`/seasons/${seasonId}/roster`),
    teamRoster: (seasonId: string) => api<TeamRoster>(`/seasons/${seasonId}/team-roster`),
    enroll: (seasonId: string, data: EnrollmentData) =>
      api<EnrollmentOut>(`/seasons/${seasonId}/enrollments`, { method: 'POST', body: { ...data } }),
    editEnrollment: (id: string, data: { staffRole?: StaffRole, position?: string, jerseyNumber?: number, status?: EnrollmentStatus }) =>
      api<EnrollmentOut>(`/enrollments/${id}`, { method: 'PATCH', body: { ...data } }),
    /** Status only, for staff with `people.manage` in the team (#27). The API shares it across the person's teams. */
    setStatus: (id: string, status: EnrollmentStatus) =>
      api<EnrollmentOut>(`/enrollments/${id}/status`, { method: 'PUT', body: { status } }),
    closeEnrollment: (id: string) => api<EnrollmentOut>(`/enrollments/${id}/close`, { method: 'POST', body: {} }),
    promote: (id: string, data: { seasonId: string, closeSource?: boolean, staffRole?: StaffRole, position?: string, jerseyNumber?: number }) =>
      api<EnrollmentOut>(`/enrollments/${id}/promote`, { method: 'POST', body: { ...data } }),
  }
}
