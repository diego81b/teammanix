import type { ClubSettings } from '../types/api'

/** Club settings (admin only): one read, one PATCH per change with only the changed fields. */
export function useClubSettings() {
  const api = useApi()
  return {
    read: () => api<ClubSettings>('/club/current/settings'),
    edit: (change: Partial<ClubSettings>) =>
      api<ClubSettings>('/club/current/settings', { method: 'PATCH', body: { ...change } }),
  }
}
