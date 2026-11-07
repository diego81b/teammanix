import type { Membership, Language, MeDto, SessionDto, UserDto } from '~/types/api'

const KEY = 'tm-session'

interface Saved {
  token: string
  user: UserDto
  activeClubId: string | null
  memberships: Membership[]
}

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  }
  catch {
    return null
  }
}

/**
 * Account session. The token lives in localStorage: the app is an SPA without refresh token (JWT 24h).
 * The server rereads the membership on every request, so what we save here only serves the UI
 * and is realigned with GET auth/me at first start (`aggiorna`).
 */
export const useSessionStore = defineStore('session', () => {
  const saved = import.meta.client ? read() : null

  const token = ref<string | null>(saved?.token ?? null)
  const user = ref<UserDto | null>(saved?.user ?? null)
  const activeClubId = ref<string | null>(saved?.activeClubId ?? null)
  const memberships = ref<Membership[]>(saved?.memberships ?? [])
  /** false until the saved content has been reconfirmed by the server in this browser session. */
  const verified = ref(false)

  const authenticated = computed(() => !!token.value)
  const active = computed(() => memberships.value.find(a => a.clubId === activeClubId.value) ?? null)
  const isAdmin = computed(() => !!active.value?.roles.some(r => r.role === 'admin' && r.scope === 'club'))

  function save() {
    try {
      if (!token.value || !user.value) localStorage.removeItem(KEY)
      else {
        const data: Saved = {
          token: token.value,
          user: user.value,
          activeClubId: activeClubId.value,
          memberships: memberships.value,
        }
        localStorage.setItem(KEY, JSON.stringify(data))
      }
    }
    catch { /* storage unavailable: the session lasts as long as the page */ }
  }

  function set(dto: SessionDto) {
    token.value = dto.accessToken
    user.value = dto.user
    activeClubId.value = dto.activeClub?.id ?? null
    memberships.value = dto.memberships
    verified.value = true
    save()
  }

  function clear() {
    token.value = null
    user.value = null
    activeClubId.value = null
    memberships.value = []
    verified.value = false
    save()
  }

  function setLanguage(language: Language) {
    if (!user.value) return
    user.value = { ...user.value, language }
    save()
  }

  /** Realigns user and memberships with the server. A 401 clears the session (the API client does it). */
  async function refresh() {
    const api = useApi()
    try {
      const me = await api<MeDto>('/auth/me')
      user.value = me.user
      activeClubId.value = me.activeClub?.clubId ?? null
      memberships.value = me.memberships
      verified.value = true
      save()
    }
    catch (e) {
      // 401: already cleared by the client. Network error: we keep the saved data and retry at the next navigation.
      if (!(e instanceof ApiError) || e.status !== 0) clear()
    }
  }

  return { token, user, activeClubId, memberships, verified, authenticated, active, isAdmin, set, setLanguage, clear, refresh }
})
