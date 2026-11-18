import type { SportProfileDto, UnitTerm } from '~/types/api'
import { clubUnitTerm } from '~/utils/structure'

/**
 * What the club calls its teams ("team" or "group"), for the labels outside the structure page (menu, scopes).
 * Only the admin has the structure, so a non admin keeps "team" and loads nothing. While loading, and when the
 * request fails, the answer is "team": no error is shown, the labels only keep the default word.
 */
export const useUnitStore = defineStore('unit', () => {
  const term = ref<UnitTerm>('team')
  // A club change or a second call can overtake a slower answer: only the last call may write.
  let last = 0

  async function refresh() {
    const call = ++last
    const session = useSessionStore()
    if (!session.token || !session.isAdmin) {
      term.value = 'team'
      return
    }
    try {
      const structure = useStructure()
      const [tree, profiles] = await Promise.all([structure.tree(), structure.profiles()])
      if (call === last) term.value = clubUnitTerm(profiles, tree.teams)
    }
    catch {
      if (call === last) term.value = 'team'
    }
  }

  /** A page that already holds the tree and the profiles hands them over, with no request. */
  function apply(teams: { sportProfile: string }[], profiles: SportProfileDto[]) {
    last++
    term.value = clubUnitTerm(profiles, teams)
  }

  return { term, refresh, apply }
})
