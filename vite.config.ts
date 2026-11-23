import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Plugins are Vite extras: react handles JSX, tailwind generates the styles.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Unit tests live next to the code; e2e/ belongs to Playwright.
  test: {
    include: ['src/**/*.test.ts'],
  },
})
