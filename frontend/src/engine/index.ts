// The calculation engine behind /api/v1 (ADR 0009): the server (fetch) or the browser (a Pyodide worker).
// Chosen at build time with VITE_ENGINE; the rest of the app only sees standard Responses.
import { useSyncExternalStore } from 'react'
import type { EngineMessage, EnginePhase, EngineRequest } from './protocol'

export type EngineKind = 'server' | 'browser'

export const ENGINE: EngineKind = import.meta.env.VITE_ENGINE === 'browser' ? 'browser' : 'server'

const API_ROOT = `${import.meta.env.VITE_API_BASE ?? ''}/api/v1`

/** Thrown when the browser engine cannot start or crashes; shown like a network error. */
export class EngineError extends Error {
  readonly name = 'EngineError'
}

// --- Start-up state ---------------------------------------------------------------------------

export interface EngineStatus {
  phase: EnginePhase
  /** Milliseconds since the engine started loading. */
  ms: number
  error?: string
}

let status: EngineStatus = { phase: ENGINE === 'server' ? 'ready' : 'idle', ms: 0 }
const listeners = new Set<() => void>()
const setStatus = (next: EngineStatus) => {
  status = next
  for (const listener of listeners) listener()
}

/** The browser engine's start-up phase ("ready" for the server engine). */
export function useEngineStatus(): EngineStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => status,
  )
}

// --- The worker ---------------------------------------------------------------------------------

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (r: Response) => void; reject: (e: Error) => void }>()

/** Start loading the browser engine (no-op for the server engine or when already started). */
export function startEngine(): void {
  if (ENGINE !== 'browser' || worker) return
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  setStatus({ phase: 'runtime', ms: 0 })
  worker.onmessage = ({ data }: MessageEvent<EngineMessage>) => {
    if (data.type === 'phase') {
      setStatus({ phase: data.phase, ms: data.ms, error: data.error })
      if (data.phase === 'failed') failAll(new EngineError(data.error ?? 'engine failed'))
      return
    }
    const waiting = pending.get(data.id)
    if (!waiting) return // the caller gave up (aborted)
    pending.delete(data.id)
    if (data.type === 'failure') waiting.reject(new EngineError(data.error))
    else waiting.resolve(toResponse(data.status, data.headers, data.body))
  }
  worker.onerror = (event) => {
    const error = event.message || 'the engine worker could not be loaded'
    setStatus({ phase: 'failed', ms: status.ms, error })
    failAll(new EngineError(error))
  }
}

function failAll(error: Error) {
  for (const { reject } of pending.values()) reject(error)
  pending.clear()
}

/** A worker reply as a standard Response (exported for tests). */
export function toResponse(code: number, headers: [string, string][], body: ArrayBuffer): Response {
  // Statuses without a body (204, 304) may not carry one.
  const empty = code === 204 || code === 304
  return new Response(empty ? null : body, { status: code, headers })
}

/** A Request's method, path, headers and body as a worker message (exported for tests). */
export async function toMessage(id: number, path: string, init: RequestInit): Promise<EngineRequest> {
  // Letting the browser build a Request encodes JSON strings and FormData (multipart with
  // boundary) exactly as fetch would send them to the server.
  const request = new Request(`http://engine${path}`, init)
  const url = new URL(request.url)
  return {
    id,
    method: request.method,
    path: url.pathname + url.search,
    headers: [...request.headers],
    body: await request.arrayBuffer(),
  }
}

async function browserFetch(path: string, init: RequestInit): Promise<Response> {
  startEngine()
  if (status.phase === 'failed') throw new EngineError(status.error ?? 'engine failed')
  const id = nextId++
  const message = await toMessage(id, path, init)
  return new Promise<Response>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    init.signal?.addEventListener('abort', () => {
      // Python cannot be interrupted; the reply is simply dropped.
      pending.delete(id)
      reject(new DOMException('aborted', 'AbortError'))
    })
    worker!.postMessage(message, [message.body])
  })
}

/** fetch() for a path below /api/v1, answered by the configured engine. */
export function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return ENGINE === 'browser' ? browserFetch(path, init) : fetch(`${API_ROOT}${path}`, init)
}
