import { describe, expect, it } from 'vitest'

import { isInstitutionalEmail, normalizeEmail } from './institutional-email'

describe('isInstitutionalEmail', () => {
  it('RF-ACCESO-08: accepts an @uabc.edu.mx address', () => {
    expect(isInstitutionalEmail('nombre.apellido@uabc.edu.mx')).toBe(true)
  })

  it('RN-02: accepts the domain in any letter case', () => {
    expect(isInstitutionalEmail('Nombre@UABC.EDU.MX')).toBe(true)
  })

  it.each([
    'nombre@gmail.com',
    'nombre@uabc.edu.mx.evil.com',
    'nombre@otro.uabc.edu.mx',
    'nombre@notuabc.edu.mx',
    '@uabc.edu.mx',
    'uabc.edu.mx',
    'nombre apellido@uabc.edu.mx',
  ])('RF-ACCESO-08: rejects %s', (email) => {
    expect(isInstitutionalEmail(email)).toBe(false)
  })
})

describe('normalizeEmail', () => {
  it('RN-02: two emails that differ only in letter case are the same account', () => {
    expect(normalizeEmail(' Nombre@UABC.edu.mx ')).toBe(normalizeEmail('nombre@uabc.edu.mx'))
  })
})
