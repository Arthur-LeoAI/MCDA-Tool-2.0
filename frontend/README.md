# Frontend

React + TypeScript + Vite + Tailwind CSS, with charts by ECharts. The UI supports Chinese and English.

## Development

Start the backend first (see the root README), then run:

```bash
npm install
npm run dev
```

Open http://localhost:5173 . The dev server forwards `/api` requests to `http://127.0.0.1:8000`, so no CORS configuration is needed.

| Command                           | Purpose                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Dev server                                                                                                                                                                                                      |
| `npm test`                        | Unit tests (Vitest)                                                                                                                                                                                             |
| `npm run test:e2e`                | End-to-end tests (Playwright): the built frontend plus the real backend; the required services are started automatically                                                                                        |
| `npm run lint`                    | Linting (oxlint)                                                                                                                                                                                                |
| `npm run format` / `format:check` | Format / check formatting (Prettier)                                                                                                                                                                            |
| `npm run typecheck`               | Type checking                                                                                                                                                                                                   |
| `npm run build`                   | Type checking plus production build, output to `dist/`                                                                                                                                                          |
| `npm run gen:api`                 | Exports `backend/openapi.json` from the backend code and regenerates `src/api/schema.d.ts` (the backend does not need to be running). Run it after changing the backend API; if you forget, CI reports an error |

If the frontend and the API are not deployed under the same domain, set the API address with `VITE_API_BASE` at build time, and add the frontend's address to `MCDA_CORS_ORIGINS` in the backend.

## Structure

```
src/
  api/          API client; schema.d.ts is generated automatically from OpenAPI, types.ts gives short names to commonly used types
  components/   Shared components (data table, number input, chart wrappers, error list, etc.)
  pages/        The five step pages: data, criteria and weights, results, sensitivity analysis, export
  lib/          Pure functions that do not depend on React: data editing, chart configuration, number parsing
  i18n/         Chinese and English texts
  store.ts      Global state (zustand), saved in the browser's localStorage so it survives a page reload
  hooks.ts      Debounced API requests, local data checks
```

All calculations are done by the backend; the frontend only edits data and displays results.
