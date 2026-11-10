/**
 * Registers the service worker that shows Web Push notifications. It runs for every visitor and asks for nothing: the
 * notification permission is requested only when the person turns push on in the profile.
 */
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* push is then offered as unsupported */ })
  })
})
