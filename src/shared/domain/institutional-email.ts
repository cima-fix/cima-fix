// RN-02: every account belongs to the institutional domain.
export const INSTITUTIONAL_DOMAIN = 'uabc.edu.mx'

// RN-02: two emails that differ only in letter case are the same account, so emails are stored
// and compared in lowercase (SDD 6.2).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// RF-ACCESO-02, RF-ACCESO-08: the address ends in @uabc.edu.mx, in any letter case, with a
// non-empty local part. A subdomain of uabc.edu.mx does not count.
export function isInstitutionalEmail(email: string): boolean {
  const normalized = normalizeEmail(email)
  const at = normalized.lastIndexOf('@')
  const localPart = normalized.slice(0, at)
  const domain = normalized.slice(at + 1)
  return at > 0 && domain === INSTITUTIONAL_DOMAIN && !/[\s@]/u.test(localPart)
}
