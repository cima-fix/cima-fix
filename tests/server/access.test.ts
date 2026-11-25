import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../src/server/app.ts'
import { getDb } from '../../src/server/db/client.ts'
import { accounts, sessions } from '../../src/server/db/schema.ts'
import { setIdentityVerifier } from '../../src/server/integrations/google-identity.ts'
import { hashSessionToken, SESSION_COOKIE } from '../../src/server/modules/access/session-token.ts'
import { useFakeGoogle } from '../helpers/fake-identity.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeAccount, makeCampus, makeCampusRole } from '../helpers/factories.ts'

// Sign-in, session and sign-out with the REAL session middleware (not asViewer).

const app = createApp()

function request(method: string, path: string, o: { cookie?: string; body?: unknown } = {}) {
  return app.request(path, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      ...(o.cookie ? { cookie: o.cookie } : {}),
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  })
}

// `name=value` of the session cookie in a Set-Cookie header.
function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie') ?? ''
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`))
  if (!match) throw new Error(`No session cookie in: ${header}`)
  return `${SESSION_COOKIE}=${match[1]}`
}

describe('access: sign-in and session', () => {
  useTestDb()
  let google: ReturnType<typeof useFakeGoogle>

  beforeEach(() => {
    google = useFakeGoogle()
  })
  afterEach(() => setIdentityVerifier(undefined))

  async function signIn(email: string) {
    const res = await request('POST', '/api/auth/google', { body: { credential: google.credentialFor(email) } })
    expect(res.status).toBe(200)
    return { res, cookie: sessionCookie(res) }
  }

  it('RF-ACCESO-02: accepts an @uabc.edu.mx account and sets the session cookie', async () => {
    const { res } = await signIn('ana@uabc.edu.mx')
    expect(await res.json()).toMatchObject({ email: 'ana@uabc.edu.mx', roles: [] })
    const header = res.headers.get('set-cookie') ?? ''
    expect(header).toMatch(/HttpOnly/i)
    expect(header).toMatch(/Secure/i)
    expect(header).toMatch(/SameSite=Lax/i)
    expect(header).toMatch(/Path=\//)
    expect(header).toMatch(/Max-Age=2592000/) // RNF-SEGURIDAD-02: 30 days
  })

  it('RF-ACCESO-02: rejects an account of another domain', async () => {
    const res = await request('POST', '/api/auth/google', {
      body: { credential: google.credentialFor('ana@gmail.com', { hostedDomain: undefined }) },
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'DOMAIN_NOT_ALLOWED' } })
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await getDb().select().from(accounts)).toHaveLength(0)
  })

  it('RN-02: requires both the hd claim and the email domain', async () => {
    const noHd = google.credentialFor('ana@uabc.edu.mx', { hostedDomain: undefined })
    const otherHd = google.credentialFor('ana@uabc.edu.mx', { hostedDomain: 'otro.edu.mx' })
    const subdomain = google.credentialFor('ana@alumnos.uabc.edu.mx', { hostedDomain: 'uabc.edu.mx' })
    for (const credential of [noHd, otherHd, subdomain]) {
      const res = await request('POST', '/api/auth/google', { body: { credential } })
      expect(res.status).toBe(403)
    }
  })

  it('RN-02: rejects an email that Google has not verified', async () => {
    const res = await request('POST', '/api/auth/google', {
      body: { credential: google.credentialFor('ana@uabc.edu.mx', { emailVerified: false }) },
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIAL' } })
  })

  it('rejects a credential that Google does not validate', async () => {
    const res = await request('POST', '/api/auth/google', { body: { credential: 'forged' } })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIAL' } })
  })

  it('rejects a body without credential', async () => {
    const res = await request('POST', '/api/auth/google', { body: {} })
    expect(res.status).toBe(400)
  })

  it('RNF-DISPONIBILIDAD-01: rejects sign-in while Google is unavailable', async () => {
    google.state.down = true
    const res = await request('POST', '/api/auth/google', { body: { credential: 'anything' } })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: 'IDENTITY_UNAVAILABLE' } })
  })

  it('RNF-DISPONIBILIDAD-01: rejects sign-in while Google is not configured', async () => {
    setIdentityVerifier(undefined)
    const previous = process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_ID
    try {
      const res = await request('POST', '/api/auth/google', { body: { credential: 'anything' } })
      expect(res.status).toBe(503)
    } finally {
      if (previous !== undefined) process.env.GOOGLE_CLIENT_ID = previous
    }
  })

  it('RNF-DISPONIBILIDAD-02: a session keeps working while Google is unavailable', async () => {
    const { cookie } = await signIn('ana@uabc.edu.mx')
    google.state.down = true
    const res = await request('GET', '/api/me', { cookie })
    expect(res.status).toBe(200)
  })

  it('RF-ACCESO-13: stores only the email, in lowercase, and the session token only as a hash', async () => {
    const { cookie } = await signIn('Ana.Lopez@UABC.edu.mx')
    const [account] = await getDb().select().from(accounts)
    expect(account).toMatchObject({ email: 'ana.lopez@uabc.edu.mx' })
    expect(Object.keys(account ?? {}).sort()).toEqual(['createdAt', 'email', 'firstLoginAt', 'id', 'lastLoginAt'])

    const token = cookie.slice(SESSION_COOKIE.length + 1)
    const [stored] = await getDb().select().from(sessions)
    expect(stored?.tokenHash).toBe(hashSessionToken(token))
    expect(stored?.tokenHash).not.toBe(token)
  })

  it('RN-02: two emails that differ only in letter case are the same account', async () => {
    await signIn('ana@uabc.edu.mx')
    await signIn('ANA@uabc.edu.mx')
    expect(await getDb().select().from(accounts)).toHaveLength(1)
  })

  it('RF-ACCESO-03: an account signing in for the first time is a reporter everywhere', async () => {
    await makeCampus()
    const { cookie } = await signIn('nuevo@uabc.edu.mx')
    expect(await (await request('GET', '/api/me', { cookie })).json()).toMatchObject({ roles: [] })
  })

  it('RF-ACCESO-06: keeps a role assigned before the first sign-in, whatever the letter case', async () => {
    const campus = await makeCampus({ name: 'Campus Sauzal' })
    const account = await makeAccount({ email: 'luis@uabc.edu.mx' })
    await makeCampusRole({ campusId: campus.id, accountId: account.id, role: 'staff' })

    const { res } = await signIn('Luis@UABC.edu.mx')
    expect(await res.json()).toEqual({
      accountId: account.id,
      email: 'luis@uabc.edu.mx',
      roles: [{ campus: { id: campus.id, name: 'Campus Sauzal' }, role: 'staff' }],
    })
    const [row] = await getDb().select().from(accounts).where(eq(accounts.id, account.id))
    expect(row?.firstLoginAt).not.toBeNull()
  })

  it('keeps first_login_at from the first sign-in and updates last_login_at', async () => {
    await signIn('ana@uabc.edu.mx')
    await getDb().execute(sql`UPDATE accounts SET first_login_at = '2026-01-01', last_login_at = '2026-01-01'`)
    await signIn('ana@uabc.edu.mx')
    const [row] = await getDb().select().from(accounts)
    expect(row?.firstLoginAt?.toISOString()).toBe(new Date('2026-01-01').toISOString())
    expect(row?.lastLoginAt?.getTime()).toBeGreaterThan(new Date('2026-01-02').getTime())
  })

  it('RF-ACCESO-01: GET /api/me without a session or with an unknown token answers 401', async () => {
    expect((await request('GET', '/api/me')).status).toBe(401)
    expect((await request('GET', '/api/me', { cookie: `${SESSION_COOKIE}=unknown` })).status).toBe(401)
  })

  it('RF-ACCESO-04: GET /api/me lists the role of the account in each campus', async () => {
    const a = await makeCampus({ name: 'A' })
    const b = await makeCampus({ name: 'B' })
    const { cookie, res } = await signIn('ana@uabc.edu.mx')
    const { accountId } = (await res.json()) as { accountId: string }
    await makeCampusRole({ campusId: a.id, accountId, role: 'admin' })
    await makeCampusRole({ campusId: b.id, accountId, role: 'staff' })

    expect(await (await request('GET', '/api/me', { cookie })).json()).toMatchObject({
      roles: [
        { campus: { id: a.id }, role: 'admin' },
        { campus: { id: b.id }, role: 'staff' },
      ],
    })
  })

  it('DD-04: a role removed applies from the next request of an open session', async () => {
    const campus = await makeCampus()
    const { cookie, res } = await signIn('ana@uabc.edu.mx')
    const { accountId } = (await res.json()) as { accountId: string }
    await makeCampusRole({ campusId: campus.id, accountId, role: 'staff' })
    expect((await request('GET', `/api/campuses/${campus.id}/roles`, { cookie })).status).toBe(200)

    await getDb().execute(sql`DELETE FROM campus_roles`)
    expect((await request('GET', `/api/campuses/${campus.id}/roles`, { cookie })).status).toBe(403)
  })

  it('RNF-SEGURIDAD-02: a session expires 30 days after sign-in', async () => {
    const before = Date.now()
    const { cookie } = await signIn('ana@uabc.edu.mx')
    const [stored] = await getDb().select().from(sessions)
    const days = ((stored?.expiresAt.getTime() ?? 0) - before) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThanOrEqual(30)
    expect(days).toBeLessThan(30.01)

    await getDb().execute(sql`UPDATE sessions SET expires_at = now() - interval '1 second'`)
    expect((await request('GET', '/api/me', { cookie })).status).toBe(401)
  })

  it('removes the expired sessions of the account when it signs in again', async () => {
    await signIn('ana@uabc.edu.mx')
    await getDb().execute(sql`UPDATE sessions SET expires_at = now() - interval '1 second'`)
    await signIn('ana@uabc.edu.mx')
    expect(await getDb().select().from(sessions)).toHaveLength(1)
  })

  it('RF-ACCESO-14: after signing out the session no longer works', async () => {
    const { cookie } = await signIn('ana@uabc.edu.mx')
    const res = await request('POST', '/api/auth/logout', { cookie })
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`, 'i'))
    expect(await getDb().select().from(sessions)).toHaveLength(0)
    expect((await request('GET', '/api/me', { cookie })).status).toBe(401)
  })

  it('RF-ACCESO-14: signing out ends only that session', async () => {
    const first = await signIn('ana@uabc.edu.mx')
    const second = await signIn('ana@uabc.edu.mx')
    await request('POST', '/api/auth/logout', { cookie: first.cookie })
    expect((await request('GET', '/api/me', { cookie: second.cookie })).status).toBe(200)
  })
})