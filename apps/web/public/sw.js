/*
 * Service worker of TeamManix: Web Push only. It caches nothing and does not touch requests.
 * The server sends JSON `{ title, body, url, tag }`; `url` is a path inside the app (it may carry `?club=`).
 * Tested in tests/unit/sw.test.ts.
 */
const CENTER = '/notifications'

/** Only a path of this origin opens: a link to another site or a `javascript:` URL falls back to the center. */
function safePath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : CENTER
}

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : {}
    return {
      title: typeof data.title === 'string' && data.title ? data.title : 'TeamManix',
      body: typeof data.body === 'string' ? data.body : '',
      url: safePath(data.url),
      tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
    }
  }
  catch {
    return { title: 'TeamManix', body: '', url: CENTER, tag: undefined }
  }
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// A push must always end in a visible notification: browsers revoke the subscription of a site that does not show one.
self.addEventListener('push', (event) => {
  const p = readPayload(event)
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: p.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0]
      if (!open) return self.clients.openWindow(target)
      return open.focus().then(() => open.navigate(target))
    }),
  )
})
