import type { NotificationList, NotificationPreference } from '../utils/notification'

/** What `PushManager.subscribe()` returns once serialized (`subscription.toJSON()`). */
export interface PushSubscriptionJson {
  endpoint: string
  keys: { p256dh: string, auth: string }
}

/**
 * Notifications of the logged in account: the center (active club), the channel preferences (every club) and the device
 * registration for Web Push. Every call is about the account itself, so no permission applies.
 */
export function useNotifications() {
  const api = useApi()
  return {
    list: (limit = 50) => api<NotificationList>(`/notifications?limit=${limit}`),
    markRead: (id: string) => api<void>(`/notifications/${id}/read`, { method: 'POST', body: {} }),
    markAllRead: () => api<void>('/notifications/read-all', { method: 'POST', body: {} }),

    preferences: () => api<NotificationPreference[]>('/notifications/preferences'),
    savePreference: (clubId: string, channels: { inApp: boolean, email: boolean, push: boolean }) =>
      api<NotificationPreference>(`/notifications/preferences/${clubId}`, { method: 'PUT', body: channels }),

    /** 404 `PUSH_NOT_CONFIGURED` when the server has no VAPID keys: push is then not offered. */
    pushKey: () => api<{ publicKey: string }>('/notifications/push/key'),
    pushSubscribe: (subscription: PushSubscriptionJson) =>
      api<void>('/notifications/push/subscription', { method: 'PUT', body: { ...subscription } }),
    pushUnsubscribe: (endpoint: string) => api<void>('/notifications/push/subscription', { method: 'DELETE', body: { endpoint } }),
  }
}
