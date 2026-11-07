/**
 * In the test environment $fetch only intercepts relative URLs (registerEndpoint).
 * The absolute URL of the development API must therefore be replaced with a relative prefix.
 */
export function baseApiRelative() {
  useRuntimeConfig().public.apiBaseUrl = '/api'
}

/** Runs `fn` inside a component's setup(): needed by composables that use useI18n(). */
export async function inSetup<T>(fn: () => T): Promise<T> {
  const { mountSuspended } = await import('@nuxt/test-utils/runtime')
  let result!: T
  await mountSuspended(defineComponent({
    setup() {
      result = fn()
      return () => null
    },
  }))
  return result
}
