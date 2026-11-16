/**
 * Side menu and mobile tab bar, pure: which entries a role sees, which one is active and how the
 * entries split between the tab bar and the "More" sheet. The layout only renders the result.
 * The label of an entry is the text `shell.<key>`, the heading of a group `shell.groups.<id>`.
 */
export type NavKey = 'home' | 'calendar' | 'absences' | 'suspensions' | 'statistics' | 'teams' | 'people' | 'invitations' | 'settings'

export interface NavEntry {
  key: NavKey
  to: string
  icon: string
}

export interface NavGroup {
  id: 'personal' | 'club'
  entries: NavEntry[]
}

const ENTRIES: Record<NavKey, NavEntry> = {
  home: { key: 'home', to: '/', icon: 'i-tm-home' },
  calendar: { key: 'calendar', to: '/calendar', icon: 'i-tm-calendar' },
  absences: { key: 'absences', to: '/absences', icon: 'i-tm-calendar' },
  suspensions: { key: 'suspensions', to: '/suspensions', icon: 'i-tm-ban' },
  statistics: { key: 'statistics', to: '/statistics', icon: 'i-tm-trend-up' },
  teams: { key: 'teams', to: '/structure', icon: 'i-tm-building' },
  people: { key: 'people', to: '/people', icon: 'i-tm-users' },
  invitations: { key: 'invitations', to: '/invitations', icon: 'i-tm-user-plus' },
  settings: { key: 'settings', to: '/settings', icon: 'i-tm-sliders' },
}

const PERSONAL: NavKey[] = ['home', 'calendar', 'absences', 'suspensions', 'statistics']
const CLUB: NavKey[] = ['teams', 'people', 'invitations', 'settings']
/** The entries the tab bar keeps for each role; the rest go to the sheet. A non admin has nothing left over. */
const TABS: Record<'admin' | 'member', NavKey[]> = {
  admin: ['home', 'calendar', 'teams', 'people'],
  member: PERSONAL,
}

const pick = (keys: NavKey[]): NavEntry[] => keys.map(k => ENTRIES[k])

/** The tab bar has about 80 px per slot at 400 px: the "My ..." entries have a short text there (`shell.tab.<key>`). */
const SHORT_TAB: NavKey[] = ['absences', 'suspensions', 'statistics']
export const tabLabelKey = (key: NavKey): string => (SHORT_TAB.includes(key) ? `shell.tab.${key}` : `shell.${key}`)

/** The personal group is for every role; the club group is for the admin only (the API rejects the pages for others anyway). */
export function navGroups(admin: boolean): NavGroup[] {
  return [
    { id: 'personal', entries: pick(PERSONAL) },
    ...(admin ? [{ id: 'club' as const, entries: pick(CLUB) }] : []),
  ]
}

/** Seasons are part of the teams and the archive is part of the people. */
const ROOTS: Record<string, string[]> = { '/structure': ['/structure', '/seasons'], '/people': ['/people', '/archive'] }

export function isNavActive(path: string, to: string): boolean {
  if (to === '/') return path === '/'
  return (ROOTS[to] ?? [to]).some(r => path === r || path.startsWith(`${r}/`))
}

export function mobileNav(admin: boolean): { tabs: NavEntry[], more: NavGroup[] } {
  const tabKeys = TABS[admin ? 'admin' : 'member']
  const more = navGroups(admin)
    .map(g => ({ ...g, entries: g.entries.filter(e => !tabKeys.includes(e.key)) }))
    .filter(g => g.entries.length > 0)
  return { tabs: pick(tabKeys), more }
}
