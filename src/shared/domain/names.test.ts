import { describe, expect, it } from 'vitest'

import { cleanName, nameKey } from './names.ts'

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

  it('keeps "ñ" as a letter of its own', () => {
    expect(nameKey('Peña')).not.toBe(nameKey('Pena'))
    expect(nameKey('PEÑA')).toBe('peña')
    // Decomposed "n" + combining tilde is the same "ñ".
    expect(nameKey('Pen\u0303a')).toBe(nameKey('Peña'))
  })

  it('still removes other accents next to an "ñ"', () => {
    expect(nameKey('Ñandú')).toBe('ñandu')
  })
})

describe('cleanName', () => {
  it('trims and collapses whitespace but keeps case and accents', () => {
    expect(cleanName('  Salón   de  Usos Múltiples ')).toBe('Salón de Usos Múltiples')
  })
})
