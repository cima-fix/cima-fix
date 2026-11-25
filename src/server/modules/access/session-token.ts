import { createHash, randomBytes } from 'node:crypto'

// Session token (SDD DD-04, 11): 32 random bytes in the cookie, only its SHA-256 in the database,
// so a copy of the database does not hold any usable session.

export const SESSION_COOKIE = 'cf_session'

// RNF-SEGURIDAD-02: absolute expiry, 30 days after sign-in.
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}