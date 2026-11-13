import type { OwnStatistics, SeasonStatistics } from '../types/api'

/**
 * Season statistics (#20), read only. Staff of the season and the admin get every player, managers in scope the team
 * totals, a player only their own row. The API decides and audits every read.
 */
export function useStatistics() {
  const api = useApi()
  return {
    ofSeason: (seasonId: string) => api<SeasonStatistics>(`/seasons/${seasonId}/statistics`),
    /** The logged in player's own figures in each of their seasons, closed ones too. */
    mine: () => api<OwnStatistics[]>('/statistics/me'),
  }
}
