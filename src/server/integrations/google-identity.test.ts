import { generateKeyPairSync, createSign } from 'node:crypto'

import { OAuth2Client } from 'google-auth-library'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ExternalServiceUnavailable } from './errors.ts'
import { createGoogleIdentityVerifier, InvalidCredential } from './google-identity.ts'

// The real adapter, with Google's key endpoint replaced by a local key pair: the token is signed
// here and checked by google-auth-library as it would check one from Google.

const CLIENT_ID = 'cima-fix-test.apps.googleusercontent.com'
const KID = 'test-key'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const CERTS = { [KID]: publicKey.export({ type: 'spki', format: 'pem' }).toString() }

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

function idToken(claims: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64({ alg: 'RS256', typ: 'JWT', kid: KID })
  const payload = b64({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    iat: now,
    exp: now + 3600,
    email: 'ana@uabc.edu.mx',
    email_verified: true,
    hd: 'uabc.edu.mx',
    name: 'Ana López',
    ...claims,
  })
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey).toString('base64url')
  return `${header}.${payload}.${signature}`
}

function googleKeys(result: 'ok' | 'down') {
  vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCerts').mockImplementation(async () => {
    if (result === 'down') throw new Error('getaddrinfo ENOTFOUND www.googleapis.com')
    return { certs: CERTS, format: 'PEM' } as never
  })
}

describe('google identity adapter', () => {
  afterEach(() => vi.restoreAllMocks())

  it('DD-05: returns only email, email_verified and hd of a valid token (RF-ACCESO-13)', async () => {
    googleKeys('ok')
    const identity = await createGoogleIdentityVerifier(CLIENT_ID).verify(idToken())
    expect(identity).toEqual({ email: 'ana@uabc.edu.mx', emailVerified: true, hostedDomain: 'uabc.edu.mx' })
  })

  it.each([
    ['another audience', { aud: 'other-client' }],
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { iat: 1_000_000, exp: 1_000_100 }],
  ])('DD-05: rejects %s', async (_, claims) => {
    googleKeys('ok')
    await expect(createGoogleIdentityVerifier(CLIENT_ID).verify(idToken(claims))).rejects.toBeInstanceOf(InvalidCredential)
  })

  it('DD-05: rejects a token with a forged signature', async () => {
    googleKeys('ok')
    const [header, , signature] = idToken().split('.')
    const forged = `${header}.${b64({ aud: CLIENT_ID, email: 'admin@uabc.edu.mx' })}.${signature}`
    await expect(createGoogleIdentityVerifier(CLIENT_ID).verify(forged)).rejects.toBeInstanceOf(InvalidCredential)
    await expect(createGoogleIdentityVerifier(CLIENT_ID).verify('not-a-jwt')).rejects.toBeInstanceOf(InvalidCredential)
  })

  it('RNF-DISPONIBILIDAD-01: reports Google as unavailable when its keys cannot be fetched', async () => {
    googleKeys('down')
    await expect(createGoogleIdentityVerifier(CLIENT_ID).verify(idToken())).rejects.toBeInstanceOf(ExternalServiceUnavailable)
  })
})