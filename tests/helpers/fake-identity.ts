import { ExternalServiceUnavailable } from '../../src/server/integrations/errors.ts'
import {
  InvalidCredential,
  setIdentityVerifier,
  type GoogleIdentity,
} from '../../src/server/integrations/google-identity.ts'

/**
 * Fake Google (SDD 16): `credentialFor()` returns a credential that the fake accepts as the given
 * identity; any other credential is rejected as invalid. `down = true` simulates Google being
 * unreachable (RNF-DISPONIBILIDAD-01).
 */
export function useFakeGoogle() {
  const identities = new Map<string, GoogleIdentity>()
  const state = { down: false }
  let counter = 0

  setIdentityVerifier({
    async verify(credential) {
      if (state.down) throw new ExternalServiceUnavailable('google')
      const identity = identities.get(credential)
      if (!identity) throw new InvalidCredential()
      return identity
    },
  })

  return {
    state,
    credentialFor(email: string, o: Partial<Omit<GoogleIdentity, 'email'>> = {}) {
      const credential = `fake-credential-${++counter}`
      identities.set(credential, { email, emailVerified: true, hostedDomain: 'uabc.edu.mx', ...o })
      return credential
    },
  }
}