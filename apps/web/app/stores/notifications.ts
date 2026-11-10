/**
 * Unread count of the active club, shown on the bell. The count comes from the API: the page of the center sets it
 * after it loads, and the shell refreshes it on navigation and when the tab becomes visible again.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const unread = ref(0)

  /** A failed read keeps the last count: a network blip must not hide what is unread. A closed session clears it. */
  async function refresh() {
    if (!useSessionStore().token) {
      unread.value = 0
      return
    }
    try {
      unread.value = (await useNotifications().list(1)).unread
    }
    catch { /* keep the last count */ }
  }

  function set(count: number) {
    unread.value = Math.max(0, count)
  }

  /** One notification was read. */
  function dropOne() {
    unread.value = Math.max(0, unread.value - 1)
  }

  return { unread, refresh, set, dropOne }
})
