import { OAuth2Client } from 'google-auth-library'

import { ExternalServiceUnavailable } from './errors.ts'

// Sign-in with Google Identity Services (SDD DD-05, 8.1, 11). The SPA sends the ID token that the
// GIS button returns; this adapter checks it against Google's public keys and returns only what
// the access service needs. The name, picture and other data in the token are dropped here, so
// they are never stored (RF-ACCESO-13).

export type GoogleIdentity = {
  email: string
  emailVerified: boolean
  // `hd` claim: the Google Workspace domain of the account, if any.
  hostedDomain: string | undefined
}

export type IdentityVerifier = {
  // Throws InvalidCredential when the token is not valid (signature, aud, iss, exp), and
  // ExternalServiceUnavailable when Google's keys cannot be fetched (RNF-DISPONIBILIDAD-01).
  verify(credential: string): Promise<GoogleIdentity>
}

export class InvalidCredential extends Error {
  constructor(cause?: unknown) {
    super('Invalid Google credential', { cause })
    this.name = 'InvalidCredential'
  }
}

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

export function createGoogleIdentityVerifier(clientId: string): IdentityVerifier {
  // The client caches Google's keys until they expire, so a warm function does not fetch them
  // on every sign-in.
  const client = new OAuth2Client({ clientId })

  return {
    async verify(credential) {
      // Fetching the keys is the only network call: a failure here means Google is unreachable,
      // not that the token is wrong.
      let certs
      try {
        certs = (await client.getFederatedSignonCerts()).certs
      } catch (error) {
        throw new ExternalServiceUnavailable('google', error)
      }

      let payload
      try {
        const ticket = await client.verifySignedJwtWithCertsAsync(credential, certs, clientId, ISSUERS)
        payload = ticket.getPayload()
      } catch (error) {
        throw new InvalidCredential(error)
      }
      if (!payload?.email) throw new InvalidCredential()

      return {
        email: payload.email,
        emailVerified: payload.email_verified === true,
        hostedDomain: payload.hd,
      }
    },
  }
}

let current: IdentityVerifier | undefined

// Built from GOOGLE_CLIENT_ID on first use (SDD 15.2). Tests inject a fake with
// `setIdentityVerifier`.
export function getIdentityVerifier(): IdentityVerifier {
  if (!current) {
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set')
    current = createGoogleIdentityVerifier(clientId)
  }
  return current
}

/** Tests only. */
export function setIdentityVerifier(verifier: IdentityVerifier | undefined): void {
  current = verifier
}