import { describe, expect, it } from 'vitest'

import { app } from '../../src/server/app.ts'
import { asViewer } from '../helpers/as-viewer.ts'

// SDD 7.1: without a session every route answers 401, even when its input is also invalid. The
// routes are read from the app, so a new route that forgets `sessionRequired` fails here.

// The only routes that do not use a session.
const WITHOUT_SESSION = new Set(['POST /api/auth/google', 'GET /api/cron/orphan-photos'])

const routes = [
  ...new Set(
    app.routes.filter((route) => route.method !== 'ALL').map((route) => `${route.method} ${route.path}`),
  ),
].filter((route) => !WITHOUT_SESSION.has(route))

describe('routes without a session', () => {
  const api = asViewer(null)

  it('finds the routes of the app', () => {
    expect(routes.length).toBeGreaterThan(10)
  })

  it.each(routes)('%s answers 401 before validating', async (route) => {
    const [method, path] = route.split(' ') as [string, string]
    // Every parameter gets an invalid value and every body is empty, so a route that validates
    // before asking for the session would answer 400.
    const url = path.replace(/:[a-zA-Z]+/g, 'not-a-uuid')
    const res = await api.app.request(url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body: '{}' }),
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('leaves the orphan photo task to its own check', async () => {
    expect((await api.get('/api/cron/orphan-photos')).status).toBe(401)
  })
})
