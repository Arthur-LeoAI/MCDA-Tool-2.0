import { EngineError, engineFetch } from '../engine'
import type { Issue } from './types'

/**
 * A failed API call. `code` and each issue's `code` are stable identifiers
 * to translate; `message` is the server's English fallback. Network
 * failures have status 0 and code "network".
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly params: Record<string, unknown>
  readonly issues: Issue[]
  readonly requestId: string | null

  constructor(
    status: number,
    code: string,
    message: string,
    options: { params?: Record<string, unknown>; issues?: Issue[]; requestId?: string | null } = {},
  ) {
    super(message)
    this.status = status
    this.code = code
    this.params = options.params ?? {}
    this.issues = options.issues ?? []
    this.requestId = options.requestId ?? null
  }
}

/** Any thrown value as an ApiError (unexpected errors become code "unknown"). */
export const asApiError = (error: unknown): ApiError =>
  error instanceof ApiError ? error : new ApiError(0, 'unknown', String(error))

async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('X-Request-ID')
  try {
    const body = await response.json()
    return new ApiError(response.status, String(body.code ?? 'unknown'), String(body.detail ?? response.statusText), {
      params: body.params,
      issues: body.issues,
      requestId: body.request_id ?? requestId,
    })
  } catch {
    // Not our error format. 502–504 come from a proxy (Vite in development, nginx in
    // Docker) that could not reach the API: report that like a network failure.
    const unreachable = [502, 503, 504].includes(response.status)
    return new ApiError(
      response.status,
      unreachable ? 'network' : 'unknown',
      response.statusText || `HTTP ${response.status}`,
      { requestId },
    )
  }
}

async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    // Paths are below /api/v1; the engine is the server or the browser (ADR 0009).
    response = await engineFetch(path, init)
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    if (error instanceof EngineError)
      throw new ApiError(0, 'engine', error.message, { params: { detail: error.message } })
    throw new ApiError(0, 'network', (error as Error).message)
  }
  if (!response.ok) throw await toApiError(response)
  return response
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await request(path, { signal })).json()
}

export async function getBlob(path: string): Promise<Blob> {
  return (await request(path, {})).blob()
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  return response.json()
}

export async function uploadFile<T>(path: string, file: File | Blob, filename: string): Promise<T> {
  const form = new FormData()
  form.append('file', file, filename)
  return (await request(path, { method: 'POST', body: form })).json()
}

/** Fetch a file (GET, or POST when a body is given) and hand it to the browser as a download. */
export async function downloadFile(path: string, body?: unknown): Promise<void> {
  const init: RequestInit =
    body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  const response = await request(path, init)
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download'
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
