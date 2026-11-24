import { describe, expect, it } from 'vitest'

import { asViewer } from '../helpers/as-viewer.ts'

// SDD 7.1: without a session every route answers 401, even when its input is also invalid.
describe('routes without a session', () => {
  const api = asViewer(null)

  it.each([
    ['GET', '/api/campuses/not-a-uuid/report-options'],
    ['GET', '/api/campuses/not-a-uuid/map'],
    ['POST', '/api/campuses/not-a-uuid/buildings'],
    ['PATCH', '/api/buildings/not-a-uuid'],
    ['POST', '/api/reports/check'],
    ['POST', '/api/reports'],
    ['POST', '/api/reports/not-a-uuid/confirmations'],
    ['PUT', '/api/campuses/not-a-uuid/map-thresholds'],
  ])('%s %s answers 401 before validating', async (method, path) => {
    const send = { GET: api.get, POST: api.post, PATCH: api.patch, PUT: api.put }[method]!
    const res = await send(path, method === 'GET' ? undefined : {})
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('leaves the orphan photo task, which uses no session, to its own check', async () => {
    const res = await api.get('/api/cron/orphan-photos')
    expect(res.status).toBe(401)
  })
})
