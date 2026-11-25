import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plugins are Vite extras: react handles JSX, tailwind generates the styles.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Unit tests live next to the code; integration tests live in tests/; e2e/ belongs to Playwright.
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // The server tests start an in-process PostgreSQL (PGlite) and apply the migrations.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  // DEFAULT_CAMPUS_SLUG is public: the SPA opens that campus first (SDD 13.4, 15.2).
  envPrefix: ['VITE_', 'DEFAULT_CAMPUS_SLUG'],
  // /api goes to the local API (npm run dev:server). The e2e tests point it at their own test
  // API with API_PROXY_TARGET (playwright.config.ts).
  server: {
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8787' },
    // Compiles the app on start, so the first page does not wait for it (and the first e2e test
    // does not time out on a cold server).
    warmup: { clientFiles: ['./src/client/main.tsx'] },
  },
})
