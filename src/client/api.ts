import { hc } from 'hono/client'
import type { AppType } from '../server/app.ts'

// Typed client of the API (SDD DD-18): routes and types are inferred from the Hono app, so the
// SPA and the API cannot drift apart. Same origin as the SPA (DD-01): in development Vite sends
// /api to the local API (vite.config.ts).
export const client = hc<AppType>('/', {
  // The session cookie is HttpOnly and same-origin; it travels on every request by default.
  init: { credentials: 'same-origin' },
  // SDD 7.1: every POST, PUT, PATCH and DELETE must be JSON, also the ones without a body
  // (resolve, cancel, sign out…); otherwise the API answers 415.
  headers: { 'content-type': 'application/json' },
})

export const api = client.api
