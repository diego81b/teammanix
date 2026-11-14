import type { SectionDto, SeasonDto, SeasonStatus, SportProfileDto, StructureTree, TeamDto, TeamGender, TeamTree, UnitTerm } from '../types/api'

/** Value of a select that stands for "nothing chosen" (the select cannot hold an empty value). */
export const NONE = 'none'

export interface TeamGroup {
  /** Null for the teams that belong to no section. */
  section: SectionDto | null
  teams: TeamTree[]
}

/**
 * Teams as the structure page shows them. Without sections the list is flat. With sections there is one group per
 * section (an empty one too, so it can be renamed or deleted) and, last, the teams outside any section.
 */
export function groupTeams(sections: SectionDto[], teams: TeamTree[]): { grouped: boolean, groups: TeamGroup[] } {
  if (sections.length === 0) return { grouped: false, groups: [{ section: null, teams }] }
  const known = new Set(sections.map(s => s.id))
  const groups: TeamGroup[] = sections.map(section => ({ section, teams: teams.filter(t => t.sectionId === section.id) }))
  const loose = teams.filter(t => t.sectionId === null || !known.has(t.sectionId))
  if (loose.length) groups.push({ section: null, teams: loose })
  return { grouped: true, groups }
}

export interface TeamFields {
  name: string
  sportProfile: string
  category: string
  /** `NONE` or a `TeamGender`. */
  gender: string
  /** `NONE` or a section id. */
  sectionId: string
  modulesActive: string[]
}

export interface TeamError {
  field: keyof TeamFields
  key: string
  params?: { min: number, max: number }
}

/** The discipline is chosen when the team is created and never changes afterwards. */
export function validateTeam(f: TeamFields, mode: 'create' | 'edit'): TeamError[] {
  const err: TeamError[] = []
  const name = f.name.trim().length
  if (name < 1 || name > 100) err.push({ field: 'name', key: 'validation.length', params: { min: 1, max: 100 } })
  if (f.category.trim().length > 60) err.push({ field: 'category', key: 'validation.length', params: { min: 1, max: 60 } })
  if (mode === 'create' && !f.sportProfile) err.push({ field: 'sportProfile', key: 'structure.sportRequired' })
  return err
}

export interface TeamCreateBody {
  name: string
  sportProfile: string
  sectionId?: string
  category?: string
  gender?: TeamGender
}

export function teamCreateBody(f: TeamFields): TeamCreateBody {
  const category = f.category.trim()
  return {
    name: f.name.trim(),
    sportProfile: f.sportProfile,
    ...(f.sectionId !== NONE ? { sectionId: f.sectionId } : {}),
    ...(category ? { category } : {}),
    ...(f.gender !== NONE ? { gender: f.gender as TeamGender } : {}),
  }
}

export interface TeamEditBody {
  name?: string
  /** Null takes the team out of its section. */
  sectionId?: string | null
  category?: string | null
  gender?: TeamGender | null
  modulesActive?: string[]
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))

/** Only what changed: the discipline is not here, the API does not accept it. */
export function teamEditBody(f: TeamFields, current: TeamDto): TeamEditBody {
  const body: TeamEditBody = {}
  const name = f.name.trim()
  if (name !== current.name) body.name = name
  const sectionId = f.sectionId === NONE ? null : f.sectionId
  if (sectionId !== current.sectionId) body.sectionId = sectionId
  const category = f.category.trim() || null
  if (category !== current.category) body.category = category
  const gender = f.gender === NONE ? null : (f.gender as TeamGender)
  if (gender !== current.gender) body.gender = gender
  if (!sameSet(f.modulesActive, current.modulesActive)) body.modulesActive = f.modulesActive
  return body
}

export interface SeasonContext {
  /** Null for a team outside any section. */
  section: SectionDto | null
  team: TeamTree
  season: SeasonDto
  hasDraft: boolean
}

/** The team (and its section) a season belongs to, read from the structure tree. */
export function seasonContext(tree: StructureTree, seasonId: string): SeasonContext | null {
  for (const team of tree.teams) {
    const season = team.seasons.find(s => s.id === seasonId)
    if (season) {
      return {
        section: tree.sections.find(s => s.id === team.sectionId) ?? null,
        team,
        season,
        hasDraft: team.seasons.some(s => s.status === 'draft'),
      }
    }
  }
  return null
}

/** Where a team stands, for lists: the section (if any) and the team. */
export function teamLabel(section: string | null, team: string): string {
  return section ? section + ' · ' + team : team
}

/** Word for the team unit in a discipline. An unknown or missing profile reads as `team`. */
export function unitTermOf(profiles: SportProfileDto[], code: string | null | undefined): UnitTerm {
  return profiles.find(p => p.code === code)?.unitTerm ?? 'team'
}

/** The club says "group" only when every team is one: a mix of disciplines, or no teams yet, says "team". */
export function clubUnitTerm(profiles: SportProfileDto[], teams: { sportProfile: string }[]): UnitTerm {
  return teams.length > 0 && teams.every(t => unitTermOf(profiles, t.sportProfile) === 'group') ? 'group' : 'team'
}

/** Season a new enrollment goes into: the active one, else the draft. Same rule as the API. */
export function seasonToEnroll(seasons: { id: string, status: SeasonStatus }[]): string | null {
  return (seasons.find(s => s.status === 'active') ?? seasons.find(s => s.status === 'draft'))?.id ?? null
}

export interface TeamChoice {
  id: string
  label: string
  sectionId: string | null
  /** `taken`: already staff in the season that would be used. `noSeason`: no active or draft season to enroll into. */
  state: 'free' | 'taken' | 'noSeason'
}

/** Teams a person can be enrolled in as staff, with the reason when one cannot be picked. */
export function staffTeamChoices(tree: StructureTree, enrollments: { seasonId: string, type: string }[]): TeamChoice[] {
  const staffIn = new Set(enrollments.filter(e => e.type === 'staff').map(e => e.seasonId))
  return tree.teams.map((team) => {
    const season = seasonToEnroll(team.seasons)
    const section = tree.sections.find(s => s.id === team.sectionId)
    return {
      id: team.id,
      label: teamLabel(section?.name ?? null, team.name),
      sectionId: team.sectionId,
      state: season === null ? 'noSeason' : staffIn.has(season) ? 'taken' : 'free',
    }
  })
}

/** `NONE` keeps every team, otherwise only the ones of that section. */
export function filterChoices(choices: TeamChoice[], sectionId: string): TeamChoice[] {
  return sectionId === NONE ? choices : choices.filter(c => c.sectionId === sectionId)
}
