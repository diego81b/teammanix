import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en'
import fr from '../../i18n/locales/fr'
import it_ from '../../i18n/locales/it'

type Tree = { [k: string]: string | Tree }
const LANGUAGES: Record<string, Tree> = { it: it_, en, fr }

function flatten(o: Tree, prefix = ''): Record<string, string> {
  return Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) }
  }, {})
}
const flat = Object.fromEntries(Object.entries(LANGUAGES).map(([l, o]) => [l, flatten(o)]))
const placeholder = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('languages', () => {
  for (const l of ['en', 'fr']) {
    describe(l, () => {
      it('has exactly the same keys as it', () => {
        expect(Object.keys(flat[l]!).sort()).toEqual(Object.keys(flat.it!).sort())
      })
      it('uses the same placeholders as it in every text', () => {
        for (const [k, v] of Object.entries(flat.it!)) expect(placeholder(flat[l]![k]!), k).toEqual(placeholder(v))
      })
    })
  }

  for (const [l, p] of Object.entries(flat)) {
    describe(`${l}: syntax`, () => {
      it('no empty text', () => {
        for (const [k, v] of Object.entries(p)) expect(v.trim(), k).not.toBe('')
      })
      it('no special vue-i18n characters (@ | { } outside placeholders)', () => {
        for (const [k, v] of Object.entries(p)) expect(v.replace(/\{\w+\}/g, ''), k).not.toMatch(/[@|{}]/)
      })
      it('no long dash', () => {
        for (const [k, v] of Object.entries(p)) expect(v, k).not.toMatch(/[—–]/)
      })
    })
  }
})

describe('API contract', () => {
  const root = join(__dirname, '../../../api/src')
  const sources = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f)
      if (statSync(p).isDirectory()) return f === 'migrations' ? [] : sources(p)
      return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : []
    })
  const codesApi = [
    ...new Set(sources(root).flatMap(f => [...readFileSync(f, 'utf8').matchAll(/code: '([A-Z_]+)'/g)].map(m => m[1]!))),
  ].sort()

  it('finds the codes in the API (the test is not empty)', () => {
    expect(codesApi.length).toBeGreaterThan(20)
  })

  for (const l of Object.keys(flat)) {
    it(`${l}: every API error code has a text`, () => {
      expect(codesApi.filter(c => !flat[l]![`errors.codes.${c}`])).toEqual([])
    })
    it(`${l}: no text for codes the API no longer uses`, () => {
      const useless = Object.keys(flat[l]!)
        .filter(k => k.startsWith('errors.codes.'))
        .map(k => k.slice('errors.codes.'.length))
        .filter(c => !codesApi.includes(c))
      expect(useless).toEqual([])
    })
  }
})

// Literal keys in the app sources ($t('a.b'), t('a.b'), keypath="a.b") must exist, or the page shows the key.
describe('keys used in the app', () => {
  const root = join(__dirname, '../../app')
  const files = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f)
      if (statSync(p).isDirectory()) return files(p)
      return /\.(vue|ts)$/.test(p) ? [p] : []
    })
  const used = [
    ...new Set(files(root).flatMap((f) => {
      const src = readFileSync(f, 'utf8')
      return [
        ...[...src.matchAll(/(?<![\w.])\$?t\(\s*'([a-zA-Z][\w.]*)'/g)].map(m => m[1]!),
        ...[...src.matchAll(/keypath="([a-zA-Z][\w.]*)"/g)].map(m => m[1]!),
      ]
    })),
  ].sort()

  it('finds keys in the sources (the test is not empty)', () => {
    expect(used.length).toBeGreaterThan(100)
  })
  it('every literal key has a text in it', () => {
    expect(used.filter(k => !flat.it![k])).toEqual([])
  })
})

// Sport profiles come from the API as codes (seed): sport name and positions are translated here.
describe('sport profiles (API seed)', () => {
  const seed = readFileSync(join(__dirname, '../../../api/src/seed/sport-profiles.ts'), 'utf8')
  const sport = [...seed.matchAll(/^\s+code: '([a-z0-9_]+)',\s*$/gm)].map(m => m[1]!)
  const staffRoles = [...new Set([...seed.matchAll(/\{ code: '([a-z0-9_]+)', policyModel/g)].map(m => m[1]!))]
  const positions = [...new Set([...seed.matchAll(/positions: \[([^\]]*)\]/g)].flatMap(m => [...m[1]!.matchAll(/'([a-z0-9_]+)'/g)].map(x => x[1]!)))]

  it('finds profiles and positions in the seed (the test is not empty)', () => {
    expect(sport.length).toBeGreaterThan(3)
    expect(positions.length).toBeGreaterThan(10)
    expect(staffRoles.length).toBeGreaterThanOrEqual(3)
  })

  for (const l of Object.keys(flat)) {
    it(`${l}: every sport, position and suggested staff role in the seed has a text`, () => {
      const missing = [
        ...sport.map(c => `sport.${c}`),
        ...positions.map(c => `position.${c}`),
        ...staffRoles.map(c => `staffRole.${c}`),
      ].filter(k => !flat[l]![k])
      expect(missing).toEqual([])
    })
    it(`${l}: no text for sports, positions or staff roles the seed does not have`, () => {
      const useless = Object.keys(flat[l]!).filter(k =>
        (k.startsWith('sport.') && !sport.includes(k.slice('sport.'.length)))
        || (k.startsWith('position.') && !positions.includes(k.slice('position.'.length)))
        || (k.startsWith('staffRole.') && !staffRoles.includes(k.slice('staffRole.'.length))))
      expect(useless).toEqual([])
    })
  }
})

// Keys built at runtime (`roles.${value}`): every value of the unions in app/types/api.ts must have a text.
const KEYS_DYNAMIC: Record<string, string[]> = {
  roles: ['admin', 'manager', 'player'],
  'staffRoles.model': ['coach', 'assistant_coach', 'trainer', 'none'],
  'staffRoles.modelText': ['coach', 'assistant_coach', 'trainer', 'none'],
  scope: ['club', 'section', 'team'],
  enrollmentType: ['player', 'staff'],
  access: ['invitations', 'roles', 'permissions'],
  gender: ['male', 'female', 'mixed'],
  'status.enrollment': ['available', 'injured'],
  'status.certificate': ['missing', 'valid', 'expiring', 'expired'],
  'status.invitation': ['sent', 'accepted', 'revoked', 'expired'],
  'status.season': ['draft', 'active', 'closed'],
  'certificate.type': ['competitive', 'not_competitive'],
}

describe('dynamic keys', () => {
  for (const l of Object.keys(flat)) {
    it(`${l}: every union value has a text`, () => {
      const missing = Object.entries(KEYS_DYNAMIC).flatMap(([base, values]) =>
        values.map(v => `${base}.${v}`).filter(k => !flat[l]![k]))
      expect(missing).toEqual([])
    })
  }
})

// The modules a team can switch on come from the seed as codes: the name shown in the team form is `module.<code>`.
describe('team modules (API seed)', () => {
  const seed = readFileSync(join(__dirname, '../../../api/src/seed/sport-profiles.ts'), 'utf8')
  const lists = [...seed.matchAll(/(?:const MODULES = |modulesAvailable: )\[([^\]]*)\]/g)]
  const modules = [...new Set(lists.flatMap(m => [...m[1]!.matchAll(/'([a-z0-9_]+)'/g)].map(x => x[1]!)))]

  it('finds the modules in the seed (the test is not empty)', () => expect(modules.length).toBeGreaterThanOrEqual(3))

  for (const l of Object.keys(flat)) {
    it(`${l}: every module in the seed has a text and no other module has one`, () => {
      const have = Object.keys(flat[l]!).filter(k => k.startsWith('module.')).map(k => k.slice('module.'.length))
      expect(have.sort()).toEqual([...modules].sort())
    })
  }
})

// The word for the team unit comes from the seed (`unitTerm`): each term has the same texts in every language.
describe('unit terms (API seed)', () => {
  const seed = readFileSync(join(__dirname, '../../../api/src/seed/sport-profiles.ts'), 'utf8')
  const terms = [...new Set([...seed.matchAll(/unitTerm: '([a-z]+)'/g)].map(m => m[1]!))].sort()
  const KEYS = [
    'text', 'emptyTitle', 'emptyText', 'newSectionText', 'deleteSectionText', 'newTeam', 'newTeamText', 'editTeam',
    'editTeamAria', 'newSeasonText', 'noTeam', 'staffTeams', 'staffTeamsText', 'staffTeamsLegend', 'staffTeamsNone', 'staffTeamsRequired',
  ]

  it('finds both terms in the seed (the test is not empty)', () => expect(terms).toEqual(['group', 'team']))

  for (const l of Object.keys(flat)) {
    it(`${l}: every term has every text and no other term has one`, () => {
      const have = [...new Set(Object.keys(flat[l]!).filter(k => k.startsWith('structure.unit.')).map(k => k.split('.')[2]!))].sort()
      expect(have).toEqual(terms)
      const missing = terms.flatMap(t => KEYS.map(k => `structure.unit.${t}.${k}`)).filter(k => !flat[l]![k])
      expect(missing).toEqual([])
    })
  }
})
