import { afterEach, describe, expect, it, vi } from 'vitest'

import { setIdentityVerifier } from '../../src/server/integrations/google-identity.ts'
import { setRateLimiters, type RateLimiter } from '../../src/server/middleware/rate-limit.ts'
import { asViewer } from '../helpers/as-viewer.ts'
import { useFakeGoogle } from '../helpers/fake-identity.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeCampus, makeViewer } from '../helpers/factories.ts'

// Generic limiter (SDD 11): by IP on sign-in, by account on writes, failing open.

const allow: RateLimiter = { allow: async () => true }
const deny: RateLimiter = { allow: async () => false }
const broken: RateLimiter = {
  allow: async () => {
    throw new Error('Upstash is down')
  },
}

describe('rate limiter', () => {
  useTestDb()
  afterEach(() => {
    setRateLimiters(undefined)
    setIdentityVerifier(undefined)
    vi.restoreAllMocks()
  })

  it('limits sign-in by the client IP', async () => {
    const login = { allow: vi.fn(async () => false) }
    setRateLimiters({ login, write: allow })
    const { app } = asViewer(null)
    const res = await app.request('/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      body: JSON.stringify({ credential: 'x' }),
    })
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } })
    expect(login.allow).toHaveBeenCalledWith('ip:203.0.113.7')
  })

  it('limits writes by account', async () => {
    const write = { allow: vi.fn(async () => false) }
    setRateLimiters({ login: allow, write })
    const campus = await makeCampus()
    const admin = await makeViewer({ campusId: campus.id, role: 'admin' })
    const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: 'a@uabc.edu.mx', role: 'staff' })
    expect(res.status).toBe(429)
    expect(write.allow).toHaveBeenCalledWith(`account:${admin.accountId}`)
  })

  it('does not limit reads', async () => {
    setRateLimiters({ login: deny, write: deny })
    expect((await asViewer(await makeViewer()).get('/api/me')).status).toBe(200)
  })

  it('leaves requests without a session to the 401', async () => {
    setRateLimiters({ login: allow, write: deny })
    expect((await asViewer(null).post('/api/auth/logout')).status).toBe(401)
  })

  it('fails open when Upstash does not answer (SDD 12)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setRateLimiters({ login: broken, write: broken })
    const google = useFakeGoogle()
    const login = await asViewer(null).post('/api/auth/google', { credential: google.credentialFor('a@uabc.edu.mx') })
    expect(login.status).toBe(200)
    const write = await asViewer(await makeViewer()).post('/api/auth/logout')
    expect(write.status).toBe(204)
  })

  it('lets everything pass when Upstash is not configured', async () => {
    const google = useFakeGoogle()
    const res = await asViewer(null).post('/api/auth/google', { credential: google.credentialFor('a@uabc.edu.mx') })
    expect(res.status).toBe(200)
  })
})