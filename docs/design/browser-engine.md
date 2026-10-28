# Design note: the browser calculation engine (route B)

- Status: done
- Based on: ADR 0009; experiment `spikes/browser-engine/README.md`

## Problem

To host the site for free on Cloudflare, it must consist of static files only. The calculations therefore have to run in the user's browser. The experiment showed that the unchanged backend works there; the work now is to connect it to the real frontend, serve all files ourselves, and keep the start-up wait acceptable.

## Two engines, one interface

- `frontend/src/engine/`: `request(method, path, init)` returns a standard `Response`.
  - **server**: `fetch` to `/api/v1` (today's behavior).
  - **browser**: the request goes to a Web Worker; the worker answers with status, headers and body, and the main thread turns that into a `Response`.
- `api/client.ts` sends every request through the engine, so JSON calls, uploads (`FormData`) and downloads (reports, templates) work unchanged.
- The engine is fixed at build time with `VITE_ENGINE=server|browser` (default `server`). `npm run build:static` builds the browser version.

## The worker

- A module Web Worker loads Pyodide from `/pyodide/` on the same site.
- It loads the packages from local wheels: numpy, pydantic, FastAPI and their dependencies from Pyodide's builds, and openpyxl, et-xmlfile and python-multipart as pure-Python wheels.
- Our code comes from `/pyodide/mcda-src.json` (the source files of `backend/src`), which the worker writes into its file system.
- Requests are passed to the FastAPI app in-process (ASGI). Blocking calls run inline, the same patch the Cloudflare Workers runtime applies.
- Every request, including uploads, is handled exactly as on the server, so error codes and validation are identical.

## Files served by the site

`npm run build:static` runs `scripts/prepare-pyodide.mjs` before the build:

- copies the Pyodide runtime files from the `pyodide` npm package (version pinned);
- downloads the package wheels listed above once into a local cache, checks them against the hashes in `pyodide-lock.json` (Pyodide's packages) or on PyPI (the pure-Python wheels), and copies them to `public/pyodide/`;
- collects `backend/src/mcda_core` and `mcda_api` into `public/pyodide/mcda-src.json`, a text file that compresses well and needs no extra tools to build.

The generated files are not committed. The largest file, `pyodide.asm.wasm`, is about 9.2 MiB, below Cloudflare's 25 MiB per file.

## Start-up

- The engine starts as soon as a page that needs it is opened: the home page starts it in the background, so it is often ready when the user reaches the tool.
- While it starts, the tool shows a progress bar with the current phase. Steps that need no calculation (choosing a scenario, mapping columns) stay usable.
- Ways to shorten start-up are measured before they are adopted.

## Data handling text

With the browser engine the home page says that project data stay in the browser; with the server engine it keeps today's text (data travel with the request and are discarded).

## Hosting on Cloudflare

`frontend/wrangler.jsonc` serves `dist-static/` (the static build's output folder) as static assets with single-page-application routing. Deploying (creating the Cloudflare account, connecting the GitHub repository) is done by the repository owner.

## Measured start-up

The static build served from the same PC, Edge, until the engine reports ready:

| | First visit | Cached |
|---|---:|---:|
| openpyxl imported at start-up | 11.6 s | 7.9–8.7 s |
| openpyxl imported only when needed | 10.8 s | 6.6–7.8 s |

On the real site the first visit also waits for the download (about 11 MB compressed in the experiment). Most of the remaining time is starting the Python runtime and importing numpy, pydantic and FastAPI. Other ideas (calling the core without FastAPI, Pyodide memory snapshots) were not adopted; they would need measurements first.

## Verification

- Unit tests: turning worker replies into `Response` objects; choosing the engine.
- End-to-end tests against the browser engine (a separate Playwright project on the static build), next to the existing tests against the server.
- Measurements of start-up and request times, recorded in this note.
