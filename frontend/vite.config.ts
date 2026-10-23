import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ECharts (~550 kB) is its own lazily loaded chunk; don't warn about it.
  build: { chunkSizeWarningLimit: 600 },
  server: {
    // The FastAPI backend (see ../backend); same-origin in dev, so no CORS needed.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
