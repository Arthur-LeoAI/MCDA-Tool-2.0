// The browser engine: the unchanged backend (mcda_core, mcda_api) in Pyodide, in a module Web Worker.
// All files come from /pyodide/ on the same site (scripts/prepare-pyodide.mjs).
import type { EngineMessage, EnginePhase, EngineRequest } from './protocol'

const BASE = `${import.meta.env.BASE_URL}pyodide/`
const started = performance.now()

const post = (message: EngineMessage, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer)
const phase = (value: EnginePhase, error?: string) =>
  post({ type: 'phase', phase: value, error, ms: Math.round(performance.now() - started) })

// Called for each request: the ASGI app in-process, without an HTTP client.
const GLUE = `
import anyio.to_thread

# The engine is single threaded, like the Cloudflare Workers runtime, which applies the same patch:
# blocking calls (sync endpoints, UploadFile) run inline instead of in a thread pool.
async def _run_sync(func, *args, **kwargs):
    return func(*args)

anyio.to_thread.run_sync = _run_sync

from mcda_api.main import app


async def call(method, path, query, headers, body):
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "scheme": "http",
        "method": method, "path": path, "raw_path": path.encode(), "root_path": "",
        "query_string": query.encode(), "server": ("browser", 80), "client": ("browser", 0),
        "headers": [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers],
    }
    received = False

    async def receive():
        nonlocal received
        if received:
            return {"type": "http.disconnect"}
        received = True
        return {"type": "http.request", "body": bytes(body), "more_body": False}

    response = {"status": 500, "headers": [], "body": []}

    async def send(message):
        if message["type"] == "http.response.start":
            response["status"] = message["status"]
            response["headers"] = [(k.decode("latin-1"), v.decode("latin-1")) for k, v in message.get("headers", [])]
        elif message["type"] == "http.response.body":
            response["body"].append(message.get("body", b""))

    await app(scope, receive, send)
    return response["status"], response["headers"], b"".join(response["body"])
`

interface Manifest {
  packages: string[]
  wheels: string[]
}

async function boot() {
  phase('runtime')
  const { loadPyodide } = (await import(/* @vite-ignore */ `${BASE}pyodide.mjs`)) as {
    loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>
  }
  const pyodide = await loadPyodide({ indexURL: BASE })
  phase('packages')
  const manifest = (await (await fetch(`${BASE}manifest.json`)).json()) as Manifest
  await pyodide.loadPackage([...manifest.packages, ...manifest.wheels.map((w) => `${BASE}${w}`)])
  phase('code')
  const sources = (await (await fetch(`${BASE}mcda-src.json`)).json()) as Record<string, string>
  for (const [path, text] of Object.entries(sources)) {
    const file = `/home/pyodide/mcda/${path}`
    pyodide.FS.mkdirTree(file.slice(0, file.lastIndexOf('/')))
    pyodide.FS.writeFile(file, text)
  }
  pyodide.runPython("import sys; sys.path.insert(0, '/home/pyodide/mcda')")
  await pyodide.runPythonAsync(GLUE)
  phase('ready')
  return pyodide
}

/** The part of Pyodide's API used here. */
interface Pyodide {
  loadPackage(names: string[]): Promise<void>
  runPython(code: string): unknown
  runPythonAsync(code: string): Promise<unknown>
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void }
  globals: { get(name: string): (...args: unknown[]) => Promise<{ toJs(): [number, [string, string][], Uint8Array] }> }
  toPy(value: unknown): unknown
}

const ready = boot().catch((error: unknown) => {
  phase('failed', String(error))
  throw error
})

self.onmessage = async ({ data }: MessageEvent<EngineRequest>) => {
  try {
    const pyodide = await ready
    const [path, query = ''] = data.path.split('?', 2)
    const result = await pyodide.globals.get('call')(
      data.method,
      `/api/v1${path}`,
      query,
      pyodide.toPy(data.headers),
      pyodide.toPy(new Uint8Array(data.body)),
    )
    const [status, headers, content] = result.toJs()
    const body = content.slice().buffer
    post({ type: 'response', id: data.id, status, headers, body }, [body])
  } catch (error) {
    post({ type: 'failure', id: data.id, error: String(error) })
  }
}
