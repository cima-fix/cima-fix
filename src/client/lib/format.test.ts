import { describe, expect, it } from 'vitest'
import { formatDateTime, formatNumber, plural } from './format'

describe('formatDateTime', () => {
  it('RNF-USABILIDAD-04: shows the time in America/Tijuana', () => {
    // 18:32 UTC is 10:32 in Tijuana (UTC-8 in November).
    expect(formatDateTime('2026-11-16T18:32:00Z')).toBe('16 nov, 10:32')
  })

  it('uses a 24-hour clock with leading zeros', () => {
    expect(formatDateTime('2026-11-12T16:10:00Z')).toBe('12 nov, 08:10')
    expect(formatDateTime('2026-11-13T00:40:00Z')).toBe('12 nov, 16:40')
  })
})

describe('formatNumber', () => {
  it('groups thousands with a comma, as in Figma', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(1024)).toBe('1,024')
  })
})

describe('plural', () => {
  it('uses the singular only for one', () => {
    expect(plural(1, 'confirmación', 'confirmaciones')).toBe('1 confirmación')
    expect(plural(0, 'confirmación', 'confirmaciones')).toBe('0 confirmaciones')
    expect(plural(4, 'confirmación', 'confirmaciones')).toBe('4 confirmaciones')
  })
})
