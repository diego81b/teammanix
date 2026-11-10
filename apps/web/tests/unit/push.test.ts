import { describe, expect, it, vi } from 'vitest'
import { createPush, type PushBrowser, type PushDevice } from '../../app/utils/push'

const subscriptionJson = { endpoint: 'https://push.test/1', keys: { p256dh: 'a', auth: 'b' } }

function device(): PushDevice & { unsubscribe: ReturnType<typeof vi.fn> } {
  return { endpoint: subscriptionJson.endpoint, toJSON: () => subscriptionJson, unsubscribe: vi.fn(() => Promise.resolve(true)) }
}

function setup(over: { browser?: Partial<PushBrowser>, key?: () => Promise<{ publicKey: string }> } = {}) {
  const current = device()
  const state = { permission: 'default' as NotificationPermission, subscription: null as PushDevice | null }
  current.unsubscribe.mockImplementation(() => { state.subscription = null; return Promise.resolve(true) })
  const browser: PushBrowser = {
    supported: true,
    permission: () => state.permission,
    requestPermission: vi.fn(() => Promise.resolve(state.permission)),
    current: () => Promise.resolve(state.subscription),
    subscribe: vi.fn(() => { state.subscription = current; return Promise.resolve(current) }),
    ...over.browser,
  }
  const api = {
    pushKey: over.key ?? (() => Promise.resolve({ publicKey: 'AQID' })),
    pushSubscribe: vi.fn(() => Promise.resolve()),
    pushUnsubscribe: vi.fn(() => Promise.resolve()),
  }
  return { push: createPush(browser, api), browser, api, state, current }
}

describe('push status', () => {
  it('unsupported browser: nothing else is asked, not even the server', async () => {
    const key = vi.fn(() => Promise.resolve({ publicKey: 'AQID' }))
    const { push } = setup({ browser: { supported: false }, key })
    expect(await push.status()).toBe('unsupported')
    expect(key).not.toHaveBeenCalled()
  })

  it('server without VAPID keys: unavailable', async () => {
    const { push } = setup({ key: () => Promise.reject(Object.assign(new Error('x'), { status: 404, code: 'PUSH_NOT_CONFIGURED' })) })
    expect(await push.status()).toBe('unavailable')
  })

  it('another failure is not hidden as "unavailable": the page shows it', async () => {
    const { push } = setup({ key: () => Promise.reject(Object.assign(new Error('x'), { status: 500, code: 'GENERIC' })) })
    await expect(push.status()).rejects.toThrow('x')
  })

  it('off before the permission, blocked once denied, on with permission and a subscription', async () => {
    const { push, state, current } = setup()
    expect(await push.status()).toBe('off')
    state.permission = 'denied'
    expect(await push.status()).toBe('blocked')
    state.permission = 'granted'
    state.subscription = current
    expect(await push.status()).toBe('on')
  })
})

describe('push enable', () => {
  it('asks the permission, subscribes with the server key and registers the device', async () => {
    const { push, browser, api, state } = setup()
    state.permission = 'granted'
    vi.mocked(browser.requestPermission).mockResolvedValue('granted')
    expect(await push.enable()).toBe('on')
    expect(browser.requestPermission).toHaveBeenCalledTimes(1)
    expect([...vi.mocked(browser.subscribe).mock.calls[0]![0]]).toEqual([1, 2, 3])
    expect(api.pushSubscribe).toHaveBeenCalledWith(subscriptionJson)
  })

  it('a refused permission subscribes nothing and registers nothing', async () => {
    const { push, browser, api, state } = setup()
    state.permission = 'denied'
    vi.mocked(browser.requestPermission).mockResolvedValue('denied')
    expect(await push.enable()).toBe('blocked')
    expect(browser.subscribe).not.toHaveBeenCalled()
    expect(api.pushSubscribe).not.toHaveBeenCalled()
  })

  it('a dismissed prompt leaves it off: the person can try again', async () => {
    const { push, browser } = setup()
    vi.mocked(browser.requestPermission).mockResolvedValue('default')
    expect(await push.enable()).toBe('off')
    expect(browser.subscribe).not.toHaveBeenCalled()
  })

  it('no server key: it does not even ask the permission', async () => {
    const { push, browser } = setup({ key: () => Promise.reject(Object.assign(new Error('x'), { code: 'PUSH_NOT_CONFIGURED' })) })
    expect(await push.enable()).toBe('unavailable')
    expect(browser.requestPermission).not.toHaveBeenCalled()
  })

  it('a device that could not be registered is removed from the browser too, so it does not look "on"', async () => {
    const { push, browser, api, state, current } = setup()
    state.permission = 'granted'
    vi.mocked(browser.requestPermission).mockResolvedValue('granted')
    api.pushSubscribe.mockRejectedValue(new Error('offline'))
    await expect(push.enable()).rejects.toThrow('offline')
    expect(current.unsubscribe).toHaveBeenCalled()
  })
})

describe('push disable and release', () => {
  it('removes the device from the server and from the browser', async () => {
    const { push, api, state, current } = setup()
    state.permission = 'granted'
    state.subscription = current
    expect(await push.disable()).toBe('off')
    expect(api.pushUnsubscribe).toHaveBeenCalledWith(subscriptionJson.endpoint)
    expect(current.unsubscribe).toHaveBeenCalled()
  })

  it('without a subscription there is nothing to remove', async () => {
    const { push, api } = setup()
    await push.disable()
    expect(api.pushUnsubscribe).not.toHaveBeenCalled()
  })

  it('release at logout never fails: a closed session must not wait on the network', async () => {
    const { push, api, state, current } = setup()
    state.subscription = current
    api.pushUnsubscribe.mockRejectedValue(new Error('offline'))
    await expect(push.release()).resolves.toBeUndefined()
    expect(current.unsubscribe).toHaveBeenCalled()
  })

  it('release does not wait forever on a browser or network that never answers: logout must not hang', async () => {
    vi.useFakeTimers()
    try {
      const { push } = setup({ browser: { current: () => new Promise(() => {}) } })
      const done = vi.fn()
      void push.release().then(done)
      await vi.advanceTimersByTimeAsync(3500)
      expect(done).toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('release with an unsupported browser does nothing', async () => {
    const { push, api } = setup({ browser: { supported: false } })
    await expect(push.release()).resolves.toBeUndefined()
    expect(api.pushUnsubscribe).not.toHaveBeenCalled()
  })
})
