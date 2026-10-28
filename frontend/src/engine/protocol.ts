// Messages between the page and the browser engine worker (docs/design/browser-engine.md).

/** Start-up phases, in order; "failed" can follow any of them. */
export type EnginePhase = 'idle' | 'runtime' | 'packages' | 'code' | 'ready' | 'failed'

export interface EngineRequest {
  id: number
  method: string
  /** Path below /api/v1, with the query string. */
  path: string
  headers: [string, string][]
  body: ArrayBuffer
}

export type EngineMessage =
  | { type: 'phase'; phase: EnginePhase; error?: string; ms: number }
  | { type: 'response'; id: number; status: number; headers: [string, string][]; body: ArrayBuffer }
  | { type: 'failure'; id: number; error: string }
