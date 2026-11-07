import type { ActivityTree, ActivityDto, TeamGender, SportProfileDto, TeamDto, SeasonDto } from '../types/api'

export interface SeasonData {
  name: string
  startDate: string
  endDate: string
  league?: string
}

export interface TeamData {
  name: string
  category?: string
  gender?: TeamGender
}

/** Activities, teams and seasons (screens 27 and 28). Admin only. */
export function useStructure() {
  const api = useApi()
  return {
    tree: () => api<ActivityTree[]>('/structure'),
    profiles: () => api<SportProfileDto[]>('/sport-profiles'),
    createActivity: (data: { name: string, sportProfile: string, modulesActive?: string[] }) =>
      api<ActivityDto>('/activities', { method: 'POST', body: data }),
    editActivity: (id: string, data: { name?: string, modulesActive?: string[] }) =>
      api<ActivityDto>(`/activities/${id}`, { method: 'PATCH', body: data }),
    createTeam: (activityId: string, data: TeamData) =>
      api<TeamDto>(`/activities/${activityId}/teams`, { method: 'POST', body: { ...data } }),
    editTeam: (id: string, data: Partial<TeamData>) =>
      api<TeamDto>(`/teams/${id}`, { method: 'PATCH', body: { ...data } }),
    createSeason: (teamId: string, data: SeasonData) =>
      api<SeasonDto>(`/teams/${teamId}/seasons`, { method: 'POST', body: { ...data } }),
    editSeason: (id: string, data: Partial<SeasonData>) =>
      api<SeasonDto>(`/seasons/${id}`, { method: 'PATCH', body: { ...data } }),
    active: (id: string) => api<SeasonDto>(`/seasons/${id}/active`, { method: 'POST', body: {} }),
    close: (id: string) => api<SeasonDto>(`/seasons/${id}/close`, { method: 'POST', body: {} }),
    clone: (id: string, data: SeasonData & { enrollments: string[] }) =>
      api<{ season: SeasonDto, enrollments: number }>(`/seasons/${id}/clone`, { method: 'POST', body: { ...data } }),
  }
}
