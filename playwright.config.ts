import { defineConfig, devices } from '@playwright/test'

import { API_PORT } from './e2e/seed'

const PORT = 5174

// End-to-end tests (SDD 16): 360 px and desktop viewports, against the dev server.
// Desktop also runs in Firefox and WebKit (Safari engine) for RNF-USABILIDAD-02.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-MX',
    timezoneId: 'America/Tijuana',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, hasTouch: true },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },
  ],
  // The SPA (Vite) and a local test API: the real Hono app on PGlite with fake Google,
  // Cloudinary and Resend, and one database per test (tests/e2e-server.ts).
  webServer: [
    {
      command: `node tests/e2e-server.ts`,
      url: `http://localhost:${API_PORT}/__e2e/plan.svg`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      env: {
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
        DEFAULT_CAMPUS_SLUG: 'sauzal',
        // Any value: the tests replace the Google button with a stand-in (e2e/fixtures.ts).
        VITE_GOOGLE_CLIENT_ID: 'e2e',
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
})
