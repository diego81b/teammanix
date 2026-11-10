import { pushState, toApplicationServerKey, type PushState } from './notification'

/** The browser side of Web Push, reduced to what the flow needs: the page wires the real `navigator`, a test wires fakes. */
export interface PushDevice {
  endpoint: string
  toJSON: () => { endpoint: string, keys: { p256dh: string, auth: string } }
  unsubscribe: () => Promise<boolean>
}

export interface PushBrowser {
  supported: boolean
  permission: () => NotificationPermission
  requestPermission: () => Promise<NotificationPermission>
  current: () => Promise<PushDevice | null>
  subscribe: (key: Uint8Array<ArrayBuffer>) => Promise<PushDevice>
}

export interface PushApi {
  pushKey: () => Promise<{ publicKey: string }>
  pushSubscribe: (subscription: { endpoint: string, keys: { p256dh: string, auth: string } }) => Promise<void>
  pushUnsubscribe: (endpoint: string) => Promise<void>
}

/** How long a logout waits for the device to be released. */
const RELEASE_TIMEOUT_MS = 3000

const notConfigured = (e: unknown) => (e as { code?: string } | null)?.code === 'PUSH_NOT_CONFIGURED'

/**
 * Turns Web Push on and off for this browser. The permission is requested only in `enable`, which runs from a tap, never at
 * startup. Every step returns the resulting state, so the switch always shows what the browser really has.
 */
export function createPush(browser: PushBrowser, api: PushApi) {
  /** The server key, or null when the server has no VAPID keys. Any other failure is the caller's to show. */
  async function serverKey(): Promise<string | null> {
    try {
      return (await api.pushKey()).publicKey
    }
    catch (e) {
      if (notConfigured(e)) return null
      throw e
    }
  }

  async function status(): Promise<PushState> {
    if (!browser.supported) return 'unsupported'
    const configured = (await serverKey()) !== null
    return pushState({
      supported: true,
      configured,
      permission: browser.permission(),
      subscribed: configured && (await browser.current()) !== null,
    })
  }

  async function enable(): Promise<PushState> {
    if (!browser.supported) return 'unsupported'
    const key = await serverKey()
    if (key === null) return 'unavailable'
    if ((await browser.requestPermission()) === 'granted') {
      const device = await browser.subscribe(toApplicationServerKey(key))
      try {
        await api.pushSubscribe(device.toJSON())
      }
      catch (e) {
        // Not registered on the server: do not leave a browser subscription that looks "on" but receives nothing.
        await device.unsubscribe().catch(() => false)
        throw e
      }
    }
    return status()
  }

  async function disable(): Promise<PushState> {
    if (!browser.supported) return 'unsupported'
    const device = await browser.current()
    if (device) {
      await api.pushUnsubscribe(device.endpoint)
      await device.unsubscribe()
    }
    return status()
  }

  /**
   * At logout: this device must stop receiving the alerts of the account that leaves. Best effort, never throws, and it
   * gives up after `RELEASE_TIMEOUT_MS`: a slow network or a worker that never starts must not hold the logout.
   */
  async function release(): Promise<void> {
    if (!browser.supported) return
    const work = (async () => {
      const device = await browser.current()
      if (!device) return
      await api.pushUnsubscribe(device.endpoint).catch(() => undefined)
      await device.unsubscribe()
    })().catch(() => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    const giveUp = new Promise<void>((resolve) => { timer = setTimeout(resolve, RELEASE_TIMEOUT_MS) })
    await Promise.race([work, giveUp])
    clearTimeout(timer)
  }

  return { status, enable, disable, release }
}
