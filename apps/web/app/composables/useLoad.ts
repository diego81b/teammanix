import { ApiError, errorText } from './useApi'

/**
 * Loading of a page: data, waiting state and error text (already translated).
 * An error does not clear the data already shown; a new success clears the error.
 */
export function useLoad<T>(read: () => Promise<T>) {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function reload(): Promise<void> {
    loading.value = true
    try {
      data.value = await read()
      error.value = null
    }
    catch (e) {
      // A 401 has already led to login: nothing to show.
      if (!(e instanceof ApiError && e.status === 401)) error.value = errorText(e)
    }
    finally {
      loading.value = false
    }
  }

  return { data, loading, error, reload }
}
