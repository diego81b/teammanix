/** Normalized error of API calls. `status` 0 = server unreachable. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** JSON object, or a Blob sent as is (raw binary upload, with its `type` as Content-Type). */
  body?: Record<string, unknown> | Blob
  /** 'blob' for files (e.g. a certificate preview). */
  response?: 'blob'
  /** A 401 on this call is not "session expired" (e.g. wrong current password). */
  withoutLogoutOn401?: boolean
}

/** API client: adds the token, normalizes errors and handles the expired session (401). */
export function useApi() {
  const config = useRuntimeConfig()
  const session = useSessionStore()

  return async function api<T>(path: string, options: Options = {}): Promise<T> {
    const hasToken = !!session.token
    try {
      return await $fetch<T>(path, {
        baseURL: config.public.apiBaseUrl,
        method: options.method ?? (options.body ? 'POST' : 'GET'),
        body: options.body,
        responseType: options.response,
        headers: {
          ...(hasToken ? { Authorization: `Bearer ${session.token}` } : {}),
          ...(options.body instanceof Blob ? { 'Content-Type': options.body.type } : {}),
        },
      })
    }
    catch (e) {
      const r = (e as { response?: { status: number, _data?: unknown } }).response
      const status = r?.status ?? 0
      const data = r?._data
      if (status === 401 && hasToken && !options.withoutLogoutOn401) {
        session.clear()
        await navigateTo('/login')
      }
      throw new ApiError(serverMessage(data), status, (data as { code?: string } | undefined)?.code)
    }
  }
}

/** Server text, only for logs and developers: never shown to the user. */
function serverMessage(data: unknown): string {
  const m = (data as { message?: string | string[] } | undefined)?.message
  return Array.isArray(m) ? m.join('. ') : (m ?? '')
}


/**
 * Text of an error for the user, in their language. It is translated by `codice` (stable, defined by the API);
 * without a code it falls back to the HTTP status. The server `message` never appears.
 */
export function errorText(e: unknown): string {
  const { t, te } = useNuxtApp().$i18n
  if (!(e instanceof ApiError)) return t('errors.generic')
  const key = `errors.codes.${e.code}`
  if (e.code && te(key)) return t(key)
  if (e.status === 0) return t('errors.network')
  if (e.status === 429) return t('errors.limit')
  return t(e.status >= 500 ? 'errors.generic' : 'errors.requestNotValid')
}
