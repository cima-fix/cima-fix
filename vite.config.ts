import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plugins are Vite extras: react handles JSX, tailwind generates the styles.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Unit tests live next to the code; integration tests live in tests/; e2e/ belongs to Playwright.
  test: {
    include: ['tests/**/*.test.ts'],
    // The server tests start an in-process PostgreSQL (PGlite) and apply the migrations.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  server: { proxy: { '/api': 'http://localhost:8787' } },
})