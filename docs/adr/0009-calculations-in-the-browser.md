# 0009 Calculations can also run in the browser

- Status: Accepted
- Date: 2026-10-28

## Context

The site should be hosted for free on Cloudflare. Static files are free there, but the Python backend cannot run on the free plan: a request may use only 10 ms of CPU time, while our calculations take tens to hundreds of milliseconds, and Containers need the paid plan (see `spikes/python-workers/README.md`).

An experiment (`spikes/browser-engine/README.md`) ran the unchanged backend in the browser with Pyodide, the WebAssembly build of Python: every request worked, and calculations were fast. Starting Python is the cost: about half a minute on a first visit and over ten seconds on later visits.

## Decision

- The frontend gets a second **calculation engine**: the same `mcda_core` and `mcda_api` code running in a Web Worker with Pyodide. Requests to `/api/v1/...` go either to the server (as today) or to this worker; the rest of the frontend does not know the difference.
- The engine is chosen at build time: the Docker image keeps the server; the static build for Cloudflare uses the browser engine.
- The static build serves Pyodide, the packages and our Python code itself. It loads nothing from third-party servers.
- The calculation core stays in one place (ADR 0002): the browser runs the same Python code, not a JavaScript copy.

## Rationale

- **Free hosting**: the whole site is static files.
- **Privacy**: with the browser engine, project data never leave the user's device.
- **One implementation**: no second calculation code to keep in step; the same tests apply to both engines.
- **The server stays**: the Docker image and the API remain for self-hosting and for other programs.

## Consequences

- Users of the static site wait for Python to start before the first calculation. The site starts loading it in the background as early as possible and shows progress.
- The browser engine uses Pyodide's builds of numpy, pydantic and FastAPI, which can be older than the versions the server uses. The end-to-end tests run against both engines.
- The site grows by about 11 MiB of downloads on a first visit, cached afterwards.
- The statement about data handling on the home page depends on the engine.
