import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { call, day, useSession, verifiedSession, type SessionDto } from './api'
import { go, PASSWORD, uniqueEmail } from './helpers'
import { blockGaps, centeredInRemaining, fillsRemaining, horizontalOverflow, sameEdges, touchViolations, type Box, type Target } from './layout-checks'

/**
 * Layout sweep: all 37 pages at 390 (phone), 768 (smallest desktop), 1440 (below the cap) and 1920 (above it),
 * plus the player views of the call-up and attendance pages at 390 and 1920 only.
 * One test per page and viewport; the checks of a page are soft, so one wrong value does not hide the next.
 * Sessions come from the API and are seeded in localStorage: no UI login, the dev throttle allows 10 logins a minute.
 * LAYOUT_SHOTS=<label> also saves the AC-12 screenshots to test-results/layout-<label>/ (Playwright empties
 * test-results on every run: copy them out right after). LAYOUT_LOG=1 prints the block counts and input heights the table and INPUT_MIN_H are pinned from, and any console error, warning or page error of the page (the browser check of the wave).
 */

const PHONE = { width: 390, height: 844 }
const TABLET = { width: 768, height: 1024 }
const LAPTOP = { width: 1440, height: 900 }
const WIDE = { width: 1920, height: 1080 }

const SIDEBAR_W = 248
const CONTENT_MAX = 1280
const NARROW_MAX = 768
// --tm-gutter, --tm-space-6, --tm-space-8, --tm-text-2xl and --tm-text-3xl, as computed values
const GUTTER = { phone: 16, wide: 24 }
const GAP = { phone: 24, wide: 32 }
const H1 = { phone: 24, wide: 32 }
const BODY = 16
const TOUCH_MIN = 44
// Smallest visible input, select or combobox of any page, measured at 390px before the layout changes. AC-6 keeps inputs at least this tall.
const INPUT_MIN_H = 40

const SHOTS = process.env.LAYOUT_SHOTS
const LOG = !!process.env.LAYOUT_LOG
const SHOTS_DIR = `test-results/layout-${SHOTS}`

type SessionKey = 'admin' | 'member' | 'noClub' | 'twoClubs' | 'incomplete'

interface Fixture {
  sessions: Record<SessionKey, SessionDto>
  seasonId: string
  futureEventId: string
  pastEventId: string
  personId: string
}

interface PageDef {
  name: string
  path: (f: Fixture) => string
  layout: 'default' | 'auth' | 'legal'
  session: SessionKey | null
  /** Narrow column of 768px (AC-10). */
  narrow?: true
  /** Minimum top-level blocks of the page root, as counted before the layout changes. 1 states that AC-8 does not apply (a single block). */
  blocks: number
  /** Body text of auth and legal pages (AC-11), CSS selector. Left out where the state the sweep reaches has no intro paragraph. */
  body?: string
  /** Renders an input, select or combobox inline as loaded. Forms inside modals or later steps are teleported or not shown: the sweep does not reach them. */
  inputs?: true
  /** AC-12 screenshot widths. */
  shots?: number[]
  /** Selector that exists only in the view the row stands for: a row that landed on the staff view would pass every layout check on the wrong page. */
  view?: string
}

const AUTH_BODY = 'main h1 + p'
const LEGAL_BODY = 'main .tm-legale-corpo > p'

const PAGES: PageDef[] = [
  { name: 'home', path: () => '/', layout: 'default', session: 'admin', blocks: 2 },
  { name: 'absences', path: () => '/absences', layout: 'default', session: 'admin', blocks: 2 },
  { name: 'archive', path: () => '/archive', layout: 'default', session: 'admin', blocks: 3, inputs: true },
  // An admin with no events of their own is sent on to the first team calendar, so /calendar needs an enrolled member.
  { name: 'calendar', path: () => '/calendar', layout: 'default', session: 'member', blocks: 2, inputs: true },
  { name: 'calendar/[seasonId]', path: f => `/calendar/${f.seasonId}`, layout: 'default', session: 'admin', blocks: 2 },
  { name: 'events/[id]/attendance', path: f => `/events/${f.pastEventId}/attendance`, layout: 'default', session: 'admin', blocks: 3 },
  { name: 'events/[id]/callup', path: f => `/events/${f.futureEventId}/callup`, layout: 'default', session: 'admin', blocks: 6, shots: [390] },
  { name: 'invitations', path: () => '/invitations', layout: 'default', session: 'admin', blocks: 3 },
  { name: 'notifications', path: () => '/notifications', layout: 'default', session: 'admin', blocks: 2, narrow: true },
  { name: 'people', path: () => '/people', layout: 'default', session: 'admin', blocks: 3, shots: [390, 1920], inputs: true },
  { name: 'people/[id]', path: f => `/people/${f.personId}`, layout: 'default', session: 'admin', blocks: 5 },
  { name: 'profile', path: () => '/profile', layout: 'default', session: 'admin', blocks: 5, narrow: true },
  { name: 'seasons/[id]', path: f => `/seasons/${f.seasonId}`, layout: 'default', session: 'admin', blocks: 2, shots: [390, 1920], inputs: true },
  { name: 'seasons/[id]/new', path: f => `/seasons/${f.seasonId}/new`, layout: 'default', session: 'admin', blocks: 4, narrow: true },
  { name: 'settings', path: () => '/settings', layout: 'default', session: 'admin', blocks: 4, narrow: true },
  { name: 'statistics', path: () => '/statistics', layout: 'default', session: 'admin', blocks: 2 },
  { name: 'statistics/[seasonId]', path: f => `/statistics/${f.seasonId}`, layout: 'default', session: 'admin', blocks: 4 },
  { name: 'structure', path: () => '/structure', layout: 'default', session: 'admin', blocks: 2, shots: [390, 1920] },
  { name: 'suspensions', path: () => '/suspensions', layout: 'default', session: 'admin', blocks: 2 },
  { name: 'suspensions/[seasonId]', path: f => `/suspensions/${f.seasonId}`, layout: 'default', session: 'admin', blocks: 2 },
  { name: 'team-absences/[seasonId]', path: f => `/team-absences/${f.seasonId}`, layout: 'default', session: 'admin', blocks: 2 },
  { name: 'team-certificates/[seasonId]', path: f => `/team-certificates/${f.seasonId}`, layout: 'default', session: 'admin', blocks: 2 },
  { name: 'team-roster/[seasonId]', path: f => `/team-roster/${f.seasonId}`, layout: 'default', session: 'admin', blocks: 2, shots: [390, 1920] },

  { name: 'check-email', path: () => '/check-email', layout: 'auth', session: null, blocks: 2, body: AUTH_BODY },
  { name: 'club/new', path: () => '/club/new', layout: 'auth', session: 'noClub', blocks: 2, body: AUTH_BODY },
  { name: 'complete-record', path: () => '/complete-record', layout: 'auth', session: 'incomplete', blocks: 2, body: AUTH_BODY },
  { name: 'invitation', path: () => '/invitation?token=invalid', layout: 'auth', session: null, blocks: 2, body: AUTH_BODY },
  { name: 'login', path: () => '/login', layout: 'auth', session: null, blocks: 2 },
  { name: 'password-forgotten', path: () => '/password-forgotten', layout: 'auth', session: null, blocks: 2, body: AUTH_BODY },
  { name: 'registration', path: () => '/registration', layout: 'auth', session: null, blocks: 2 },
  { name: 'reset-password', path: () => '/reset-password?token=invalid', layout: 'auth', session: null, blocks: 2 },
  { name: 'select-club', path: () => '/select-club', layout: 'auth', session: 'twoClubs', blocks: 2, body: AUTH_BODY },
  { name: 'verify-email', path: () => '/verify-email?token=invalid', layout: 'auth', session: null, blocks: 2, body: AUTH_BODY },
  { name: 'welcome', path: () => '/welcome', layout: 'auth', session: 'noClub', blocks: 2, body: AUTH_BODY },

  { name: 'terms', path: () => '/terms', layout: 'legal', session: null, blocks: 2, body: LEGAL_BODY },
  { name: 'privacy', path: () => '/privacy', layout: 'legal', session: null, blocks: 2, body: LEGAL_BODY },
  { name: 'dpa', path: () => '/dpa', layout: 'legal', session: null, blocks: 2, body: LEGAL_BODY },
]

// What a linked player sees of the same two pages (the member session): swept at 390 and 1920 only.
const PLAYER_PAGES: PageDef[] = [
  { name: 'events/[id]/callup (player)', path: f => `/events/${f.futureEventId}/callup`, layout: 'default', session: 'member', blocks: 2, view: 'main section[aria-label="Convocati"]' },
  { name: 'events/[id]/attendance (player)', path: f => `/events/${f.pastEventId}/attendance`, layout: 'default', session: 'member', blocks: 2, view: 'main section[aria-label="La tua presenza"]' },
]

const DEFAULT_PAGES = PAGES.filter(p => p.layout === 'default')

// --- fixture ---------------------------------------------------------------------------------------------------

/** An admin with a club, a section, a team, an active season, two players, a past and a future training with one player called up, plus one account per auth state. */
async function buildFixture(): Promise<Fixture> {
  const adminEmail = uniqueEmail('layout')
  const club = await call<SessionDto>('POST', '/club', (await verifiedSession(adminEmail)).accessToken, { name: 'ASD Layout', acceptDpa: true })
  const admin = club.accessToken

  const section = await call<{ id: string }>('POST', '/sections', admin, { name: 'Settore Giovanile' })
  const team = await call<{ id: string }>('POST', '/teams', admin, { name: 'Under 12', sportProfile: 'football', sectionId: section.id })
  const season = await call<{ id: string }>('POST', `/teams/${team.id}/seasons`, admin, { name: 'Stagione in corso', startDate: day(-30), endDate: day(300) })
  const players: Array<{ personId: string, enrollmentId: string }> = []
  for (const name of ['Bruno', 'Carla']) {
    const person = await call<{ id: string }>('POST', '/people', admin, { name, surname: 'Verdi', birthDate: '2014-03-04', email: `${name.toLowerCase()}-${adminEmail}` })
    const enrollment = await call<{ id: string }>('POST', `/seasons/${season.id}/enrollments`, admin, { personId: person.id, type: 'player' })
    await call('POST', `/people/${person.id}/certificates`, admin, { type: 'competitive', issueDate: day(-5), expiryDate: day(300) })
    players.push({ personId: person.id, enrollmentId: enrollment.id })
  }
  await call('POST', `/seasons/${season.id}/active`, admin)
  const training = (offset: number) => call<{ id: string }>('POST', `/teams/${team.id}/events`, admin, {
    type: 'training',
    start: `${day(offset)}T16:00:00Z`,
    end: `${day(offset)}T17:30:00Z`,
  })
  const future = await training(1)
  const past = await training(-2)
  // One call-up not sent yet: the send button of the action bar is enabled.
  await call('POST', `/events/${future.id}/callups`, admin, { enrollmentId: players[0]!.enrollmentId })

  // A player linked to an account: /calendar lists the events of their team.
  const memberEmail = uniqueEmail('layout-member')
  const memberUser = await verifiedSession(memberEmail, 'Dora')
  const memberPerson = await call<{ id: string }>('POST', '/people', admin, { name: 'Dora', surname: 'Neri', birthDate: '2014-05-06', email: memberEmail })
  await call('POST', `/seasons/${season.id}/enrollments`, admin, { personId: memberPerson.id, type: 'player' })
  await call('POST', '/invitations', admin, { email: memberEmail, role: 'player', personId: memberPerson.id })
  const [memberInvitation] = await call<Array<{ id: string }>>('GET', '/invitations/mine', memberUser.accessToken)
  const member = await call<SessionDto>('POST', `/invitations/mine/${memberInvitation!.id}/accept`, memberUser.accessToken)

  const noClub = await verifiedSession(uniqueEmail('layout-noclub'), 'Nino')

  const twoEmail = uniqueEmail('layout-two')
  const first = await call<SessionDto>('POST', '/club', (await verifiedSession(twoEmail, 'Tia')).accessToken, { name: 'Club Uno', acceptDpa: true })
  await call('POST', '/club', first.accessToken, { name: 'Club Due', acceptDpa: true })
  // With two clubs the login leaves the choice open (no active club).
  const twoClubs = await call<SessionDto>('POST', '/auth/login', null, { email: twoEmail, password: PASSWORD })

  // Invited with a name only: accepting leaves the record to complete.
  const incompleteEmail = uniqueEmail('layout-incomplete')
  const invitee = await verifiedSession(incompleteEmail, 'Ines')
  await call('POST', '/invitations', admin, { email: incompleteEmail, role: 'player', name: 'Ines Neri' })
  const [open] = await call<Array<{ id: string }>>('GET', '/invitations/mine', invitee.accessToken)
  const incomplete = await call<SessionDto>('POST', `/invitations/mine/${open!.id}/accept`, invitee.accessToken)

  // An invitation still open with a long address: /invitations then shows the resend and revoke buttons next to it (AC-5 at 768).
  await call('POST', '/invitations', admin, { email: uniqueEmail('layout-open-invitation-for-a-long-address'), role: 'admin' })

  return {
    sessions: { admin: club, member, noClub, twoClubs, incomplete },
    seasonId: season.id,
    futureEventId: future.id,
    pastEventId: past.id,
    personId: players[0]!.personId,
  }
}

// A failed test (soft failures included) restarts the worker and runs beforeAll again: keep one fixture per run.
// Playwright empties test-results when a run starts, so the cache never outlives its run.
const CACHE = 'test-results/layout-fixture.json'
async function loadFixture(): Promise<Fixture> {
  if (existsSync(CACHE) && Date.now() - statSync(CACHE).mtimeMs < 30 * 60_000) return JSON.parse(readFileSync(CACHE, 'utf8')) as Fixture
  const fixture = await buildFixture()
  mkdirSync('test-results', { recursive: true })
  writeFileSync(CACHE, JSON.stringify(fixture))
  return fixture
}

let fx: Fixture
test.beforeAll(async () => {
  test.setTimeout(120_000)
  fx = await loadFixture()
})

test.use({ trace: 'off', screenshot: 'off' })

// --- measuring ---------------------------------------------------------------------------------------------------

interface Snap {
  clientWidth: number
  scrollWidth: number
  h1: number | null
  main: Box | null
  sidebar: Box | null
  sidebarLabels: string[]
  content: Box | null
  padding: { left: number, right: number } | null
  rootBox: Box | null
  blocks: Array<{ y: number, height: number }>
  targets: Array<Target & { label: string, where: string }>
  inputs: number[]
  /** Every input-like element of main, hidden ones included: a page with hidden ones only is not the same as a selector that sees nothing. */
  inputsInDom: number
}

/** Everything the checks need, read in one round trip. */
const INPUTS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select, [role=combobox]'

const snapshot = (page: Page): Promise<Snap> => page.evaluate((INPUTS) => {
  const box = (el: Element) => {
    const r = el.getBoundingClientRect()
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }
  }
  const shown = (el: Element) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0
  }
  const main = document.querySelector('main')
  const h1 = main ? [...main.querySelectorAll('h1')].find(shown) : undefined
  const sidebar = document.querySelector('nav.sticky')
  const content = document.querySelector('[data-layout="content"]')
  const root = (content ?? main)?.firstElementChild ?? null
  const contentStyle = content ? getComputedStyle(content) : null
  const blocks = root
    ? [...root.children]
        .filter(el => shown(el) && !['fixed', 'absolute'].includes(getComputedStyle(el).position) && !el.classList.contains('sr-only'))
        .map(el => ({ y: box(el).y, height: box(el).height }))
    : []
  // Inputs have their own height rule; checkboxes, switches and radios are controls, not buttons.
  const control = ['combobox', 'checkbox', 'switch', 'radio']
  const candidates: Array<[Element, string]> = [
    ...(main ? [...main.querySelectorAll('button')].map((e): [Element, string] => [e, 'main']) : []),
    ...[...document.querySelectorAll('nav.fixed a, nav.fixed button')].map((e): [Element, string] => [e, 'tab bar']),
  ]
  const targets = candidates
    .filter(([e]) => shown(e) && !e.closest('.sr-only') && !control.includes(e.getAttribute('role') ?? ''))
    .map(([e, where]) => {
      const r = e.getBoundingClientRect()
      const text = (e.textContent ?? '').trim()
      return { width: r.width, height: r.height, iconOnly: text === '', label: e.getAttribute('aria-label') ?? text.slice(0, 30), where }
    })
  const inputs = main
    ? [...main.querySelectorAll(INPUTS)]
        .filter(shown)
        .map(e => e.getBoundingClientRect().height)
    : []
  const inputsInDom = main ? main.querySelectorAll(INPUTS).length : 0
  return {
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    h1: h1 ? parseFloat(getComputedStyle(h1).fontSize) : null,
    main: main ? box(main) : null,
    sidebar: sidebar && shown(sidebar) ? box(sidebar) : null,
    sidebarLabels: sidebar ? [...sidebar.querySelectorAll('a, button')].map(e => (e as HTMLElement).innerText.trim()) : [],
    content: content ? box(content) : null,
    padding: contentStyle ? { left: parseFloat(contentStyle.paddingLeft), right: parseFloat(contentStyle.paddingRight) } : null,
    rootBox: root ? box(root) : null,
    blocks,
    targets,
    inputs,
    inputsInDom,
  }
}, INPUTS)

const fontPx = (loc: Locator) => loc.first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))

/** Opens the page as the table says and waits until its title is there and nothing is loading. */
async function open(page: Page, p: PageDef, viewport: { width: number, height: number }) {
  await page.setViewportSize(viewport)
  if (LOG) {
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console] ${p.name} ${viewport.width}: ${m.type()} ${m.text()}`) })
    page.on('pageerror', e => console.log(`[console] ${p.name} ${viewport.width}: pageerror ${e.message}`))
  }
  if (p.session) await useSession(page, fx.sessions[p.session])
  const url = p.path(fx)
  await go(page, url)
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('main [role="status"]', { hasText: /^Caricamento$/ })).toHaveCount(0)
  await page.waitForLoadState('networkidle').catch(() => {})
  // decideAccess redirects without a word: a page measured after a redirect would be the wrong page.
  expect(new URL(page.url()).pathname, `${url} redirected`).toBe(new URL(url, 'http://localhost').pathname)
  if (p.view) await expect(page.locator(p.view), `${p.name} is not the view the row stands for`).toHaveCount(1)
}

async function shot(page: Page, p: PageDef, width: number) {
  if (!SHOTS || !p.shots?.includes(width)) return
  mkdirSync(SHOTS_DIR, { recursive: true })
  await page.screenshot({ path: `${SHOTS_DIR}/${p.name.replaceAll('/', '_').replaceAll(/[[\]]/g, '')}-${width}.png`, fullPage: true })
}

function gapsAreEqual(blocks: Snap['blocks'], expected: number, p: PageDef, width: number) {
  if (LOG) console.log(`[blocks] ${p.name} ${width}: ${blocks.length} blocks, gaps ${blockGaps(blocks).map(g => Math.round(g)).join(',')}`)
  if (p.blocks < 2) return
  expect.soft(blocks.length, 'AC-8 top-level blocks found').toBeGreaterThanOrEqual(p.blocks)
  const gaps = blockGaps(blocks)
  expect.soft(gaps.every(g => Math.abs(g - expected) < 0.5), `AC-8 gaps between blocks ${gaps.map(g => Math.round(g))}, expected ${expected}`).toBe(true)
}

// --- 390: phone ---------------------------------------------------------------------------------------------------

test.describe('390x844', () => {
  for (const p of [...PAGES, ...PLAYER_PAGES]) {
    test(p.name, async ({ page }) => {
      await open(page, p, PHONE)
      await shot(page, p, 390)
      const s = await snapshot(page)

      expect.soft(horizontalOverflow(s.scrollWidth, s.clientWidth), `AC-5 page scrolls sideways (${s.scrollWidth} > ${s.clientWidth})`).toBe(false)
      expect.soft(s.h1, 'AC-7 h1 font size').toBe(H1.phone)
      if (p.layout !== 'default') return

      expect.soft(s.content === null, 'content box [data-layout="content"] missing').toBe(false)
      if (s.padding) {
        expect.soft(s.padding.left, 'AC-3 content padding left').toBe(GUTTER.phone)
        expect.soft(s.padding.right, 'AC-3 content padding right').toBe(GUTTER.phone)
      }
      gapsAreEqual(s.blocks, GAP.phone, p, 390)

      expect.soft(s.targets.length, 'AC-6 touch targets found').toBeGreaterThan(0)
      const small = touchViolations(s.targets, TOUCH_MIN)
      expect.soft(small.map(t => `${t.where} "${t.label}" ${Math.round(t.width)}x${Math.round(t.height)}`), 'AC-6 touch targets under 44px').toEqual([])
      if (LOG) console.log(`[inputs] ${p.name}: ${s.inputs.length} visible of ${s.inputsInDom}${s.inputs.length > 0 ? `, min ${Math.min(...s.inputs)}` : ''}`)
      // Declared in the table, so an input that appears or disappears is a decision and not a silent skip.
      expect.soft(s.inputs.length > 0, `AC-6 inputs found (${s.inputs.length}), page declared ${p.inputs ? 'with' : 'without'} inputs`).toBe(!!p.inputs)
      if (s.inputs.length > 0) expect.soft(Math.min(...s.inputs), 'AC-6 input height not below the pinned minimum').toBeGreaterThanOrEqual(INPUT_MIN_H)
    })
  }

  test('"Altro" sheet items are at least 44px tall', async ({ page }) => {
    await open(page, PAGES[0]!, PHONE)
    await page.getByRole('button', { name: 'Altro', exact: true }).click()
    const items = page.getByRole('dialog').getByRole('link')
    await expect(items.first()).toBeVisible()
    const heights = await items.evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
    expect.soft(heights.length, 'AC-6 "Altro" items found').toBeGreaterThan(0)
    expect.soft(heights.filter(h => h < TOUCH_MIN), 'AC-6 "Altro" items under 44px').toEqual([])
  })

  // The fixed send bar of the call-up and the fixed tab bar both sit at the bottom: the send button must be the element hit at its center.
  test('callup: the send button is not covered by the tab bar', async ({ page }) => {
    await open(page, PAGES.find(x => x.name === 'events/[id]/callup')!, PHONE)
    const send = page.getByRole('button', { name: /^Invia/ })
    await expect(send).toBeVisible()
    const result = await send.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const tab = document.querySelector('nav.fixed')?.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return {
        button: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
        tabBar: tab ? { top: Math.round(tab.top), bottom: Math.round(tab.bottom) } : null,
        hit: hit ? `${hit.tagName.toLowerCase()}${hit.closest('nav.fixed') ? ' in the tab bar' : ''}` : 'nothing',
        reachable: !!hit && el.contains(hit),
      }
    })
    console.log(`[C7] ${JSON.stringify(result)}`)
    await page.screenshot({ path: 'test-results/layout-c7-callup-390.png' })
    expect.soft(result.reachable, `C7 element at the center of the send button: ${result.hit}; button ${JSON.stringify(result.button)}, tab bar ${JSON.stringify(result.tabBar)}`).toBe(true)
  })
})

// --- 768: smallest desktop ----------------------------------------------------------------------------------------

test.describe('768x1024', () => {
  for (const p of DEFAULT_PAGES) {
    test(p.name, async ({ page }) => {
      await open(page, p, TABLET)
      const s = await snapshot(page)
      expect.soft(horizontalOverflow(s.scrollWidth, s.clientWidth), `AC-5 page scrolls sideways (${s.scrollWidth} > ${s.clientWidth})`).toBe(false)
      expect.soft(s.sidebar === null, 'sidebar missing').toBe(false)
      expect.soft(s.sidebar?.width, 'AC-4 sidebar width').toBe(SIDEBAR_W)
      expect.soft(s.sidebarLabels.length, 'AC-4 sidebar entries found').toBeGreaterThan(0)
      expect.soft(s.sidebarLabels.filter(l => l === ''), 'AC-4 sidebar entries without a label').toEqual([])
    })
  }
})

// --- 1440: below the cap ------------------------------------------------------------------------------------------

test.describe('1440x900', () => {
  for (const p of DEFAULT_PAGES) {
    test(p.name, async ({ page }) => {
      await open(page, p, LAPTOP)
      const s = await snapshot(page)
      expect.soft(s.sidebar === null || s.content === null, 'sidebar or content box [data-layout="content"] missing').toBe(false)
      if (s.sidebar && s.content) {
        expect.soft(fillsRemaining(s.sidebar, s.content, s.clientWidth), `AC-2 content spans sidebar edge to viewport edge (content x ${Math.round(s.content.x)} width ${Math.round(s.content.width)}, sidebar right ${Math.round(s.sidebar.x + s.sidebar.width)}, viewport ${s.clientWidth})`).toBe(true)
      }
    })
  }
})

// --- 1920: above the cap ------------------------------------------------------------------------------------------

/** AC-9: the elements the issue asks to judge, on the four reference pages. */
const AC9: Record<string, Array<{ what: string, at: (page: Page) => Locator, px: number }>> = {
  'structure': [
    { what: 'team name', at: page => page.locator('main article h3'), px: BODY },
    { what: 'season name in the team', at: page => page.locator('main article li a .font-medium'), px: BODY },
    // The section h2 is a section title (tm-section-title, 20px from md); AC-9's 16px applies to team names only (D18).
    { what: 'section title', at: page => page.locator('main section h2'), px: 20 },
  ],
  'people': [
    { what: 'person name in the row', at: page => page.locator('main ul li a span.font-medium'), px: BODY },
  ],
  'seasons/[id]': [
    { what: 'person name in the roster row', at: page => page.locator('main table tbody th[scope="row"] a'), px: BODY },
  ],
  'team-roster/[seasonId]': [
    { what: 'person name in the roster row', at: page => page.locator('main ul li p.font-semibold'), px: BODY },
    { what: 'intro paragraph', at: page => page.locator('main p', { hasText: /^Giocatori e staff della stagione/ }), px: BODY },
  ],
}

test.describe('1920x1080', () => {
  for (const p of [...PAGES, ...PLAYER_PAGES]) {
    test(p.name, async ({ page }) => {
      await open(page, p, WIDE)
      await shot(page, p, 1920)
      const s = await snapshot(page)

      expect.soft(s.h1, 'AC-7 h1 font size').toBe(H1.wide)

      if (p.layout === 'auth') expect.soft(s.main?.width, 'AC-11 auth card width').toBe(440)
      if (p.layout === 'legal') expect.soft(s.main?.width, 'AC-11 legal column width').toBe(NARROW_MAX)
      if (p.body) {
        const body = page.locator(p.body)
        expect.soft(await body.count(), `AC-11 body text found (${p.body})`).toBeGreaterThan(0)
        if (await body.count() > 0) expect.soft(await fontPx(body), 'AC-11 body text size').toBe(BODY)
      }
      if (p.layout !== 'default') return

      expect.soft(s.sidebar === null || s.content === null, 'sidebar or content box [data-layout="content"] missing').toBe(false)
      if (s.sidebar && s.content) {
        expect.soft(s.sidebar.x, 'AC-1 sidebar left edge').toBe(0)
        expect.soft(s.sidebar.width, 'AC-1 sidebar width').toBe(SIDEBAR_W)
        expect.soft(Math.abs(s.content.width - CONTENT_MAX) <= 1, `AC-1 content width ${s.content.width}, expected ${CONTENT_MAX}`).toBe(true)
        expect.soft(centeredInRemaining(s.sidebar, s.content, s.clientWidth), `AC-1 content centered in the remaining width (content x ${Math.round(s.content.x)} width ${Math.round(s.content.width)}, sidebar right ${Math.round(s.sidebar.x + s.sidebar.width)}, viewport ${s.clientWidth})`).toBe(true)
      }
      if (s.padding) {
        expect.soft(s.padding.left, 'AC-3 content padding left').toBe(GUTTER.wide)
        expect.soft(s.padding.right, 'AC-3 content padding right').toBe(GUTTER.wide)
      }
      gapsAreEqual(s.blocks, GAP.wide, p, 1920)

      if (p.narrow) {
        expect.soft(s.rootBox !== null && s.rootBox.width <= NARROW_MAX, `AC-10 page content ${s.rootBox?.width}px wide, at most ${NARROW_MAX}`).toBe(true)
        if (s.rootBox && s.content && s.padding) {
          expect.soft(Math.abs(s.rootBox.x - (s.content.x + s.padding.left)) <= 1, `AC-10 left edge ${s.rootBox.x}, content text edge ${s.content.x + s.padding.left}`).toBe(true)
        }
      }

      for (const c of AC9[p.name] ?? []) {
        const at = c.at(page)
        expect.soft(await at.count(), `AC-9 ${c.what} found`).toBeGreaterThan(0)
        if (await at.count() > 0) expect.soft(await fontPx(at), `AC-9 ${c.what} font size`).toBe(c.px)
      }

      if (p.name === 'events/[id]/callup') {
        // AC-13: the inner row of the action bar shares the edges of the content box.
        const row = page.locator('div.fixed').filter({ has: page.getByRole('button', { name: /^Invia/ }) }).first().locator('> div').first()
        expect.soft(await row.count(), 'AC-13 action bar inner row found').toBe(1)
        expect.soft(s.content === null, 'AC-13 needs the content box [data-layout="content"] to compare with').toBe(false)
        if (s.content && await row.count() === 1) {
          const b = (await row.boundingBox())!
          expect.soft(sameEdges(b, s.content), `AC-13 bar row x ${Math.round(b.x)} width ${Math.round(b.width)}, content box x ${Math.round(s.content.x)} width ${Math.round(s.content.width)}`).toBe(true)
        }
      }
    })
  }
})
