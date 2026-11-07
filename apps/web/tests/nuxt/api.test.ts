import { baseApiRelative } from './helpers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'

const navigateToMock = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navigateToMock)

beforeEach(() => {
  baseApiRelative()
  localStorage.clear()
  useSessionStore().clear()
  navigateToMock.mockReset()
})

const error = (statusCode: number, body: Record<string, unknown> = {}) => () =>
  new Response(JSON.stringify(body), { status: statusCode, headers: { 'content-type': 'application/json' } })
const login = () => {
  const s = useSessionStore()
  s.token = 'tok'
  return s
}

describe('useApi', () => {
  it('sends the token as Bearer when a session exists', async () => {
    let auth: string | undefined
    registerEndpoint('/api/t/ok', (event) => {
      auth = event.node.req.headers.authorization
      return { ok: true }
    })
    login()
    expect(await useApi()('/t/ok')).toEqual({ ok: true })
    expect(auth).toBe('Bearer tok')
  })

  it('sends no Authorization without a session', async () => {
    let auth: string | undefined
    registerEndpoint('/api/t/anon', (event) => {
      auth = event.node.req.headers.authorization
      return {}
    })
    await useApi()('/t/anon')
    expect(auth).toBeUndefined()
  })

  it('normalizes the error: status and code', async () => {
    registerEndpoint('/api/t/422', error(422, { code: 'INVALID_DATA', message: ['a', 'b'] }))
    const e = (await useApi()('/t/422').catch(x => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(422)
    expect(e.code).toBe('INVALID_DATA')
  })

  it('401 with session: clears it and goes to login', async () => {
    registerEndpoint('/api/t/401', error(401))
    const s = login()
    await useApi()('/t/401').catch(() => {})
    expect(s.token).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('401 with noLogoutOn401: the session stays', async () => {
    registerEndpoint('/api/t/401b', error(401, { code: 'PASSWORD_CURRENT_WRONG' }))
    const s = login()
    const e = (await useApi()('/t/401b', { withoutLogoutOn401: true }).catch(x => x)) as ApiError
    expect(e.code).toBe('PASSWORD_CURRENT_WRONG')
    expect(s.token).toBe('tok')
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('401 without session (wrong login): no redirect', async () => {
    registerEndpoint('/api/t/401c', error(401, { code: 'INVALID_CREDENTIALS' }))
    await useApi()('/t/401c').catch(() => {})
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('with a body the default method is POST', async () => {
    let method = ''
    registerEndpoint('/api/t/post', (event) => {
      method = event.method
      return {}
    })
    await useApi()('/t/post', { body: { a: 1 } })
    expect(method).toBe('POST')
  })
})

describe('errorText', () => {
  const i18n = () => useNuxtApp().$i18n
  const it_ = (k: string) => i18n().t(k)

  beforeEach(async () => {
    await i18n().setLocale('it')
  })

  it('translates by code', () => {
    expect(errorText(new ApiError('x', 400, 'LAST_ADMIN'))).toBe(it_('errors.codes.LAST_ADMIN'))
  })
  it('unknown code: falls back to the status', () => {
    expect(errorText(new ApiError('x', 500, 'BOH'))).toBe(it_('errors.generic'))
    expect(errorText(new ApiError('x', 400, 'BOH'))).toBe(it_('errors.requestNotValid'))
  })
  it('network and rate limit', () => {
    expect(errorText(new ApiError('', 0))).toBe(it_('errors.network'))
    expect(errorText(new ApiError('', 429))).toBe(it_('errors.limit'))
  })
  it('non-API error: generic', () => {
    expect(errorText(new Error('boom'))).toBe(it_('errors.generic'))
  })
  it('never shows the server message', () => {
    expect(errorText(new ApiError('Internal secret', 500))).not.toContain('secret')
  })
  it('follows the current language', async () => {
    await i18n().setLocale('fr')
    expect(errorText(new ApiError('', 0))).toMatch(/serveur/)
  })
})
