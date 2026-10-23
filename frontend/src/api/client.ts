import type { Issue } from './types'

const BASE = import.meta.env.VITE_API_BASE ?? ''

/** Error returned by the API: {detail, issues: [{location, message}]}. */
export class ApiError extends Error {
  readonly status: number
  readonly issues: Issue[]

  constructor(status: number, message: string, issues: Issue[] = []) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json()
    return new ApiError(response.status, String(body.detail ?? response.statusText), body.issues ?? [])
  } catch {
    return new ApiError(response.status, response.statusText || `HTTP ${response.status}`)
  }
}

async function request(path: string, init: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, init)
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError(0, 'network')
  }
  if (!response.ok) throw await toApiError(response)
  return response
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await request(path, { signal })).json()
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
