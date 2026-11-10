import { createPush, type PushBrowser, type PushDevice } from '../utils/push'

/** The real browser behind `PushBrowser`. Shell only: the flow and its rules are in `utils/push.ts`. */
function realBrowser(): PushBrowser {
  const supported = import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  // Registering twice returns the same worker, so this also covers a first visit where the plugin has not finished yet.
  const ready = async () => {
    await navigator.serviceWorker.register('/sw.js')
    return navigator.serviceWorker.ready
  }
  return {
    supported,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    current: async () => (await (await ready()).pushManager.getSubscription()) as PushDevice | null,
    subscribe: async key => (await (await ready()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })) as unknown as PushDevice,
  }
}

/** Web Push of this browser for the logged in account. Call `enable` only from a tap: that is when the browser may ask. */
export function usePush() {
  return createPush(realBrowser(), useNotifications())
}
