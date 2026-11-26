import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transformTokens } from '../../theme-transform.mjs'

const WEB = join(__dirname, '../..')
const APP = join(WEB, 'app')
const MOCKUP = join(WEB, '../../mockup')
const APP_TOKENS = join(APP, 'assets/css/tokens.css')
const MOCKUP_TOKENS = join(MOCKUP, 'ui/css/tokens.css')

function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(dir, e.name), ext) : ext.test(e.name) ? [join(dir, e.name)] : [])
}
const read = (f: string) => readFileSync(f, 'utf8')
// A Windows checkout with autocrlf has CRLF token files: compare them as LF
const readLf = (f: string) => read(f).replaceAll('\r\n', '\n')
const rel = (f: string, base: string) => relative(base, f).replaceAll('\\', '/')
const repo = (f: string) => rel(f, join(WEB, '../..'))
const hasClass = (classes: string, name: string) => classes.split(/\s+/).includes(name)

const vueFiles = walk(APP, /\.vue$/).sort()
const pageFiles = vueFiles.filter(f => f.startsWith(join(APP, 'pages')))
// Pages rooted in LegalText take their layout from the component, not from a root element of their own
const LEGAL_PAGES = ['terms.vue', 'privacy.vue', 'dpa.vue']
const ownRootPages = pageFiles.filter(f => !LEGAL_PAGES.includes(rel(f, join(APP, 'pages'))))

/** Class attribute of the first element of the template (the page root). */
function rootClasses(file: string): string {
  const root = read(file).match(/<template>\s*<([A-Za-z][\w-]*)([^>]*)>/)
  if (!root) throw new Error(`no root element in ${file}`)
  return root[2]!.match(/\sclass="([^"]*)"/)?.[1] ?? ''
}

// Type or weight utilities that would beat the global h1 rule (it sits in @layer base)
const H1_SIZE_OR_WEIGHT = /(^|\s)(sm:|md:|lg:)?(text-(xs|sm|base|lg|xl|[2-9]xl)|font-(medium|semibold|bold|extrabold))(\s|$)/

const h1Files = vueFiles.filter(f => /<h1[\s>]/.test(read(f)))

describe('h1 sizing', () => {
  it.each(h1Files.map(f => [rel(f, APP), f] as const))('%s: no h1 carries a size or weight class', (_name, file) => {
    const tags = [...read(file).matchAll(/<h1(\s[^>]*)?>/g)].map(m => m[1] ?? '')
    const classes = tags.flatMap(t => [...t.matchAll(/(?:^|\s):?class="([^"]*)"/g)].map(m => m[1]!))
    for (const c of classes) expect(c, `h1 class "${c}"`).not.toMatch(H1_SIZE_OR_WEIGHT)
  })
})

describe('page roots', () => {
  it.each(ownRootPages.map(f => [rel(f, join(APP, 'pages')), f] as const))('%s: root carries tm-page and no space-y', (_name, file) => {
    const classes = rootClasses(file)
    expect(hasClass(classes, 'tm-page'), `root class "${classes}"`).toBe(true)
    expect(classes).not.toMatch(/(^|\s)space-y-/)
  })

  it('exactly settings, profile, seasons/[id]/new and notifications carry tm-page--narrow', () => {
    const narrow = vueFiles.filter(f => hasClass(rootClasses(f), 'tm-page--narrow')).map(f => rel(f, join(APP, 'pages'))).sort()
    expect(narrow).toEqual(['notifications.vue', 'profile.vue', 'seasons/[id]/new.vue', 'settings.vue'])
  })
})

describe('welcome group headings', () => {
  it('both h2 use tm-section-title, not 16px semibold', () => {
    const tags = [...read(join(APP, 'pages/welcome.vue')).matchAll(/<h2(\s[^>]*)?>/g)].map(m => m[1] ?? '')
    expect(tags).toHaveLength(2)
    for (const t of tags) {
      const classes = /(?:^|\s)class="([^"]*)"/.exec(t)?.[1] ?? ''
      expect(hasClass(classes, 'tm-section-title'), `h2 class "${classes}"`).toBe(true)
      expect(classes).not.toMatch(/(^|\s)(text-base|font-semibold)(\s|$)/)
    }
  })

  it('the "have a link" toggle is at least 44px tall', () => {
    const button = /<h2\s[^>]*id="t-invitation"[^>]*>\s*<button\s([^>]*)>/.exec(read(join(APP, 'pages/welcome.vue')))
    const classes = /(?:^|\s)class="([^"]*)"/.exec(button?.[1] ?? '')?.[1] ?? ''
    expect(button, 'toggle button not found inside h2#t-invitation').not.toBeNull()
    expect(hasClass(classes, 'min-h-11'), `button class "${classes}"`).toBe(true)
  })
})

describe('widths come from tokens', () => {
  it('no max-w-3xl remains under app', () => {
    const offenders = walk(APP, /\.(vue|ts|css)$/).filter(f => read(f).includes('max-w-3xl'))
    expect(offenders.map(f => rel(f, APP))).toEqual([])
  })

  it.each([MOCKUP_TOKENS, APP_TOKENS].map(f => [repo(f), f] as const))('%s: --tm-content-max is 1280px and --tm-narrow-max is 768px', (_name, file) => {
    const css = read(file)
    expect(css).toMatch(/--tm-content-max:\s*1280px;/)
    expect(css).toMatch(/--tm-narrow-max:\s*768px;/)
  })

  // AC-14: spec and tokens agree on the content width
  it.each([
    join(MOCKUP, 'PROMPT-UI.md'),
    join(MOCKUP, 'ui/components-standalone.html'),
    join(MOCKUP, 'ui/studio-colori.html'),
    MOCKUP_TOKENS,
    APP_TOKENS,
  ].map(f => [repo(f), f] as const))('%s: no longer states 1120', (_name, file) => {
    expect(read(file)).not.toContain('1120')
  })
})

describe('generated tokens', () => {
  // Regression guard for C6: the app file is generated, never edited by hand
  it('app tokens.css equals the transform of the mockup tokens', () => {
    expect(readLf(APP_TOKENS)).toBe(transformTokens(readLf(MOCKUP_TOKENS)))
  })

  it('transforming a CRLF checkout of the mockup tokens gives the same file as the LF one', () => {
    const lf = readLf(MOCKUP_TOKENS)
    const crlf = lf.replaceAll('\n', '\r\n')
    expect(transformTokens(crlf)).toBe(transformTokens(lf))
  })
})
