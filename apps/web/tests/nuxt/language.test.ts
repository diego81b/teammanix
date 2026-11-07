import { readBody } from 'h3'
import { baseApiRelative, inSetup } from './helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import LanguageSelector from '../../app/components/LanguageSelector.vue'

let calls: Array<{ language: string }> = []

beforeEach(async () => {
  baseApiRelative()
  localStorage.clear()
  useSessionStore().clear()
  calls = []
  registerEndpoint('/api/auth/language', {
    method: 'PATCH',
    handler: async (event) => {
      const body = await readBody(event)
      calls.push(body)
      return { language: body.language }
    },
  })
  await useNuxtApp().$i18n.setLocale('it')
})

const context = () => inSetup(() => ({ language: useLanguage(), s: useSessionStore() }))
const user = () => ({ id: 'u1', email: 'a@b.it', name: 'A', surname: 'B', language: 'it' as const })

describe('useLanguage', () => {
  it('apply changes the language and saves it', async () => {
    await (await context()).language.apply('en')
    expect(useNuxtApp().$i18n.locale.value).toBe('en')
    expect(localStorage.getItem('tm-language')).toBe('en')
  })

  it('apply with save=false does not persist the choice', async () => {
    await (await context()).language.apply('fr', false)
    expect(useNuxtApp().$i18n.locale.value).toBe('fr')
    expect(localStorage.getItem('tm-language')).toBeNull()
  })

  it('set as guest: no API call', async () => {
    await (await context()).language.set('en')
    expect(calls).toEqual([])
  })

  it('set as authenticated: PATCH and store aligned', async () => {
    const { language, s } = await context()
    s.token = 'tok'
    s.user = user()
    await language.set('fr')
    expect(calls).toEqual([{ language: 'fr' }])
    expect(s.user?.language).toBe('fr')
  })

  it('setting the language already in use: no call', async () => {
    const { language, s } = await context()
    s.token = 'tok'
    s.user = user()
    await language.set('it')
    expect(calls).toEqual([])
  })

  it('if the API fails the interface still changes', async () => {
    registerEndpoint('/api/auth/language', { method: 'PATCH', handler: () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }) })
    const { language, s } = await context()
    s.token = 'tok'
    s.user = user()
    await language.set('en')
    expect(useNuxtApp().$i18n.locale.value).toBe('en')
    expect(s.user?.language).toBe('it')
  })
})

describe('LanguageSelector', () => {
  it('shows the three languages and marks the current one', async () => {
    const w = await mountSuspended(LanguageSelector)
    const buttons = w.findAll('button')
    expect(buttons.map(b => b.text())).toEqual(['Italiano', 'English', 'Français'])
    expect(buttons[0]!.attributes('aria-current')).toBe('true')
    expect(buttons[1]!.attributes('aria-current')).toBeUndefined()
  })

  it('clicking changes the language', async () => {
    const w = await mountSuspended(LanguageSelector)
    await w.findAll('button')[2]!.trigger('click')
    await vi.waitFor(() => expect(useNuxtApp().$i18n.locale.value).toBe('fr'))
  })
})
