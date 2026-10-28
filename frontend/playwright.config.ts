import { defineConfig, devices } from '@playwright/test'

const CI = Boolean(process.env.CI)

// End-to-end tests drive the production build of the frontend against the
// real API. Locally they reuse a running API and use the installed Microsoft
// Edge; CI starts everything fresh with a downloaded Chromium.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Each worker runs a browser against the same local servers; more than two slow each other down.
  workers: 2,
  // Whole user flows (import, several pages, downloads) need more than the 30 s default.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4319',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  projects: [
    // The same tests against both calculation engines (ADR 0009).
    {
      name: 'server',
      use: { ...devices['Desktop Chrome'], channel: CI ? undefined : 'msedge', baseURL: 'http://localhost:4319' },
    },
    {
      // The static build: Python starts in each new browser context, so allow for that.
      name: 'browser',
      use: { ...devices['Desktop Chrome'], channel: CI ? undefined : 'msedge', baseURL: 'http://localhost:4331' },
      // Two tests may start Python at the same time; on a busy machine that can take over a minute.
      timeout: 240_000,
      expect: { timeout: 120_000 },
    },
  ],
  webServer: [
    {
      command: 'uv run --directory ../backend uvicorn mcda_api.main:app --port 8000',
      url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    {
      // `vite preview` serves the build and proxies /api like the dev server.
      command: 'npm run build && npm run preview -- --port 4319 --strictPort',
      url: 'http://localhost:4319',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // The static build with the browser engine; no API server involved.
      command:
        'node scripts/prepare-pyodide.mjs && npx vite build --mode static && npx vite preview --mode static --port 4331 --strictPort',
      url: 'http://localhost:4331',
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
})
