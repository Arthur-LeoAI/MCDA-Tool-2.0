import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  // vite.config.ts is a function of the mode (static build vs. server build).
  viteConfig({ command: 'serve', mode: 'test' }),
  defineConfig({
    test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
  }),
)
