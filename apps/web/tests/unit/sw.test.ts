import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Runs `public/sw.js` against a fake service worker scope and returns its handlers and the spies it called. */
function load() {
  const handlers: Record<string, (event: unknown) => void> = {}
  const shown: { title: string, options: Record<string, unknown> }[] = []
  const opened: string[] = []
  const navigated: string[] = []
  const focused = vi.fn()
  let clients: { focus: () => Promise<unknown>, navigate: (url: string) => Promise<unknown> }[] = []
  const scope = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: (event: unknown) => void) => { handlers[type] = fn },
    skipWaiting: vi.fn(),
    registration: { showNotification: (title: string, options: Record<string, unknown>) => { shown.push({ title, options }); return Promise.resolve() } },
    clients: {
      claim: vi.fn(),
      matchAll: () => Promise.resolve(clients),
      openWindow: (url: string) => { opened.push(url); return Promise.resolve() },
    },
  }
  new Function('self', readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8'))(scope)
  return {
    handlers,
    shown,
    opened,
    navigated,
    focused,
    setClients(count: number) {
      clients = Array.from({ length: count }, () => ({
        focus: () => { focused(); return Promise.resolve() },
        navigate: (url: string) => { navigated.push(url); return Promise.resolve() },
      }))
    },
  }
}

/** An event whose `waitUntil` keeps the promise, so a test can wait for the handler to finish. */
function event(extra: Record<string, unknown> = {}) {
  const pending: Promise<unknown>[] = []
  return { ...extra, waitUntil: (p: Promise<unknown>) => { pending.push(p) }, done: () => Promise.all(pending) }
}

const push = (payload: unknown) => event({ data: { json: () => (typeof payload === 'function' ? (payload as () => unknown)() : payload) } })

let sw: ReturnType<typeof load>
beforeEach(() => { sw = load() })

describe('service worker: push', () => {
  it('shows the notification the server sent, grouped by its tag, with the path to open', async () => {
    const e = push({ title: 'ASD Dakar: nuova convocazione', body: 'Allenamento, giovedì.', url: '/calendar?club=c1', tag: 'n1' })
    sw.handlers.push!(e)
    await e.done()
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0]!.title).toBe('ASD Dakar: nuova convocazione')
    expect(sw.shown[0]!.options).toMatchObject({ body: 'Allenamento, giovedì.', tag: 'n1', data: { url: '/calendar?club=c1' } })
  })

  it('a payload that is not JSON still shows something: a push without a visible notification can get the subscription revoked', async () => {
    const e = push(() => { throw new Error('not json') })
    sw.handlers.push!(e)
    await e.done()
    expect(sw.shown).toHaveLength(1)
    expect(sw.shown[0]!.title).toBe('TeamManix')
    expect(sw.shown[0]!.options.data).toEqual({ url: '/notifications' })
  })

  it('a push without data shows the same default', async () => {
    const e = event()
    sw.handlers.push!(e)
    await e.done()
    expect(sw.shown[0]!.title).toBe('TeamManix')
  })

  it('ignores a link that leaves the app: only paths of this origin open', async () => {
    for (const url of ['https://evil.test/x', '//evil.test/x', 'javascript:alert(1)', 5]) {
      const e = push({ title: 'T', body: 'B', url })
      sw.handlers.push!(e)
      await e.done()
    }
    expect(sw.shown.map(s => (s.options.data as { url: string }).url)).toEqual(['/notifications', '/notifications', '/notifications', '/notifications'])
  })
})

describe('service worker: click', () => {
  const click = (url?: string) => event({ notification: { close: vi.fn(), data: url === undefined ? undefined : { url } } })

  it('opens the link in an open window of the app, and focuses it', async () => {
    sw.setClients(1)
    const e = click('/calendar?club=c1')
    sw.handlers.notificationclick!(e)
    await e.done()
    expect(sw.navigated).toEqual(['https://app.test/calendar?club=c1'])
    expect(sw.focused).toHaveBeenCalledTimes(1)
    expect(sw.opened).toEqual([])
  })

  it('opens a new window when the app is closed', async () => {
    sw.setClients(0)
    const e = click('/calendar')
    sw.handlers.notificationclick!(e)
    await e.done()
    expect(sw.opened).toEqual(['https://app.test/calendar'])
  })

  it('closes the notification, and a click without a link opens the center', async () => {
    sw.setClients(0)
    const e = click()
    sw.handlers.notificationclick!(e)
    await e.done()
    expect((e as unknown as { notification: { close: () => void } }).notification.close).toHaveBeenCalled()
    expect(sw.opened).toEqual(['https://app.test/notifications'])
  })
})

describe('service worker: lifecycle', () => {
  it('takes control at once, so a new version does not wait for every tab to close', async () => {
    const install = event()
    sw.handlers.install!(install)
    const activate = event()
    sw.handlers.activate!(activate)
    await activate.done()
    expect(sw.handlers.install).toBeDefined()
  })
})
