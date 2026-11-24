import { describe, expect, it } from 'vitest'

import { cleanName, nameKey } from './names'

describe('nameKey', () => {
  it('RF-CATALOGO-08: ignores letter case', () => {
    expect(nameKey('Edificio A')).toBe(nameKey('EDIFICIO a'))
  })

  it('RF-CATALOGO-08: ignores accents', () => {
    expect(nameKey('Iluminación')).toBe(nameKey('Iluminacion'))
    expect(nameKey('Salón Ámbar')).toBe(nameKey('salon ambar'))
  })

  it('RF-CATALOGO-08: ignores leading, trailing and consecutive whitespace', () => {
    expect(nameKey('  Laboratorio   3 ')).toBe(nameKey('Laboratorio 3'))
    expect(nameKey('Laboratorio\t3')).toBe(nameKey('Laboratorio 3'))
  })

  it('RF-CATALOGO-08: names that differ in another way keep different keys', () => {
    expect(nameKey('Salón 201')).not.toBe(nameKey('Salón 202'))
  })

  it('treats precomposed and decomposed accents the same', () => {
    expect(nameKey('Café')).toBe(nameKey('Café'))
  })

  // SDD 10.8 removes every combining mark, including the tilde of "ñ".
  it('treats "ñ" as "n", as SDD 10.8 defines', () => {
    expect(nameKey('Año')).toBe(nameKey('Ano'))
  })
})

describe('cleanName', () => {
  it('trims and collapses whitespace but keeps case and accents', () => {
    expect(cleanName('  Salón   de  Usos Múltiples ')).toBe('Salón de Usos Múltiples')
  })
})
