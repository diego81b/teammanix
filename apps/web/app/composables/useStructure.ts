import type { StructureTree, SectionDto, SportProfileDto, TeamDto, SeasonDto } from '../types/api'
import type { TeamCreateBody, TeamEditBody } from '../utils/structure'

export interface SeasonData {
  name: string
  startDate: string
  endDate: string
  league?: string
}

/** Sections, teams and seasons (screens 27 and 28). Admin only. */
export function useStructure() {
  const api = useApi()
  return {
    tree: () => api<StructureTree>('/structure'),
    profiles: () => api<SportProfileDto[]>('/sport-profiles'),
    createSection: (data: { name: string }) => api<SectionDto>('/sections', { method: 'POST', body: data }),
    editSection: (id: string, data: { name: string }) => api<SectionDto>(`/sections/${id}`, { method: 'PATCH', body: data }),
    /** The teams of the section stay, outside any section. The API refuses while roles or invitations point to it. */
    removeSection: (id: string) => api<void>(`/sections/${id}`, { method: 'DELETE' }),
    createTeam: (data: TeamCreateBody) => api<TeamDto>('/teams', { method: 'POST', body: { ...data } }),
    editTeam: (id: string, data: TeamEditBody) => api<TeamDto>(`/teams/${id}`, { method: 'PATCH', body: { ...data } }),
    createSeason: (teamId: string, data: SeasonData) =>
      api<SeasonDto>(`/teams/${teamId}/seasons`, { method: 'POST', body: { ...data } }),
    editSeason: (id: string, data: Partial<SeasonData>) =>
      api<SeasonDto>(`/seasons/${id}`, { method: 'PATCH', body: { ...data } }),
    active: (id: string) => api<SeasonDto>(`/seasons/${id}/active`, { method: 'POST', body: {} }),
    close: (id: string) => api<SeasonDto>(`/seasons/${id}/close`, { method: 'POST', body: {} }),
    /** `carrySuspensions`: what is left of the suspensions by matches of the chosen people moves to the new season (rule 13). */
    clone: (id: string, data: SeasonData & { enrollments: string[], carrySuspensions?: boolean }) =>
      api<{ season: SeasonDto, enrollments: number, suspensions: number }>(`/seasons/${id}/clone`, { method: 'POST', body: { ...data } }),
  }
}
