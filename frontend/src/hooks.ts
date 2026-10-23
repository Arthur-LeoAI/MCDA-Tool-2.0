import { useEffect, useMemo, useState } from 'react'
import { type ApiError, asApiError, postJson } from './api/client'
import { checkDraft } from './lib/problem'
import { useStore } from './store'

interface ApiState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
}

/**
 * POST `body` to `path` whenever it changes (debounced; stale requests are
 * aborted). Pass `null` to skip the request. While a new request runs, the
 * previous data stays available so views do not flicker.
 */
export function useApiPost<T>(path: string, body: unknown, delay = 250): ApiState<T> {
  const key = body === null ? null : `${path}\n${JSON.stringify(body)}`
  const [settled, setSettled] = useState<{ key: string | null; data: T | null; error: ApiError | null }>({
    key: null,
    data: null,
    error: null,
  })

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      postJson<T>(path, body, controller.signal)
        .then((data) => setSettled({ key, data, error: null }))
        .catch((error: Error) => {
          if (error.name === 'AbortError') return
          setSettled({ key, data: null, error: asApiError(error) })
        })
    }, delay)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `key` captures `body`; listing `body` would refire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, delay])

  if (key === null) return { data: null, error: null, loading: false }
  const fresh = settled.key === key
  return { data: settled.data, error: fresh ? settled.error : null, loading: !fresh }
}

/** The current draft checked locally; `problem` is set once it can be sent to the API. */
export function useCheckedDraft() {
  const draft = useStore((s) => s.draft)
  return useMemo(() => (draft ? { draft, ...checkDraft(draft) } : null), [draft])
}
