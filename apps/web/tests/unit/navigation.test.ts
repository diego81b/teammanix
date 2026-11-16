import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en'
import fr from '../../i18n/locales/fr'
import it_ from '../../i18n/locales/it'
import { isNavActive, mobileNav, navGroups, tabLabelKey, type NavKey } from '../../app/utils/navigation'

const keys = (entries: { key: NavKey }[]) => entries.map(e => e.key)

describe('navGroups', () => {
  it('gives an admin the personal group and the club group, in that order', () => {
    const groups = navGroups(true)
    expect(groups.map(g => g.id)).toEqual(['personal', 'club'])
    expect(keys(groups[0]!.entries)).toEqual(['home', 'calendar', 'absences', 'suspensions', 'statistics'])
    expect(keys(groups[1]!.entries)).toEqual(['teams', 'people', 'invitations', 'settings'])
  })

  it('gives everyone else the personal group only', () => {
    const groups = navGroups(false)
    expect(groups.map(g => g.id)).toEqual(['personal'])
    expect(keys(groups[0]!.entries)).toEqual(['home', 'calendar', 'absences', 'suspensions', 'statistics'])
  })

  it('points every entry to a distinct path', () => {
    const paths = navGroups(true).flatMap(g => g.entries.map(e => e.to))
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths).toContain('/invitations')
    expect(paths).toContain('/structure')
  })
})

describe('isNavActive', () => {
  it('matches the home only on the exact path', () => {
    expect(isNavActive('/', '/')).toBe(true)
    expect(isNavActive('/calendar', '/')).toBe(false)
  })

  it('matches an entry on its path and on the pages below it', () => {
    expect(isNavActive('/calendar', '/calendar')).toBe(true)
    expect(isNavActive('/calendar/abc', '/calendar')).toBe(true)
    expect(isNavActive('/calendars', '/calendar')).toBe(false)
  })

  it('keeps seasons under teams and the archive under people', () => {
    expect(isNavActive('/seasons', '/structure')).toBe(true)
    expect(isNavActive('/seasons/1/roster', '/structure')).toBe(true)
    expect(isNavActive('/archive', '/people')).toBe(true)
    expect(isNavActive('/archive', '/structure')).toBe(false)
  })
})

describe('mobileNav', () => {
  it('gives an admin four tabs and a sheet with the rest, grouped as on the desktop', () => {
    const { tabs, more } = mobileNav(true)
    expect(keys(tabs)).toEqual(['home', 'calendar', 'teams', 'people'])
    expect(more.map(g => g.id)).toEqual(['personal', 'club'])
    expect(keys(more[0]!.entries)).toEqual(['absences', 'suspensions', 'statistics'])
    expect(keys(more[1]!.entries)).toEqual(['invitations', 'settings'])
  })

  it('shows every personal entry as a tab for a non admin, with no sheet', () => {
    const { tabs, more } = mobileNav(false)
    expect(keys(tabs)).toEqual(['home', 'calendar', 'absences', 'suspensions', 'statistics'])
    expect(more).toEqual([])
  })

  it('never goes over five slots, counting the sheet trigger', () => {
    for (const admin of [true, false]) {
      const { tabs, more } = mobileNav(admin)
      expect(tabs.length + (more.length > 0 ? 1 : 0)).toBeLessThanOrEqual(5)
    }
  })

  it('has no entry both in a tab and in the sheet, and none missing', () => {
    for (const admin of [true, false]) {
      const { tabs, more } = mobileNav(admin)
      const all = [...keys(tabs), ...more.flatMap(g => keys(g.entries))].sort()
      expect(all).toEqual(navGroups(admin).flatMap(g => keys(g.entries)).sort())
    }
  })
})

describe('tabLabelKey', () => {
  it('uses the short text for the long personal entries and the normal one for the rest', () => {
    expect(tabLabelKey('absences')).toBe('shell.tab.absences')
    expect(tabLabelKey('statistics')).toBe('shell.tab.statistics')
    expect(tabLabelKey('home')).toBe('shell.home')
    expect(tabLabelKey('teams')).toBe('shell.teams')
  })

  it('points to a text that exists in every language', () => {
    for (const [name, locale] of Object.entries({ it: it_, en, fr })) {
      const get = (path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], locale)
      for (const e of navGroups(true).flatMap(g => g.entries)) expect(get(tabLabelKey(e.key)), `${name}: ${tabLabelKey(e.key)}`).toBeTypeOf('string')
    }
  })
})

describe('navigation texts', () => {
  const entries = navGroups(true).flatMap(g => g.entries)

  it('has a label in every language for every entry, and a group heading', () => {
    for (const [name, locale] of Object.entries({ it: it_, en, fr })) {
      const shell = locale.shell as Record<string, unknown>
      for (const e of entries) expect(shell[e.key], `${name}: shell.${e.key}`).toBeTypeOf('string')
      const groups = shell.groups as Record<string, unknown>
      expect(groups.personal, `${name}: shell.groups.personal`).toBeTypeOf('string')
      expect(groups.club, `${name}: shell.groups.club`).toBeTypeOf('string')
    }
  })

  it('names the invitations entry after what the page holds', () => {
    expect(it_.shell.invitations).toBe('Inviti e ruoli')
    expect(it_.shell.teams).toBe('Squadre')
  })
})
