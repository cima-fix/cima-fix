import { describe, expect, it } from 'vitest'

import { toLevel, toLevelValue } from './levels'
import { priority } from './priority'

const LOW = toLevelValue('low')
const MEDIUM = toLevelValue('medium')
const HIGH = toLevelValue('high')

describe('priority', () => {
  // The whole verification criterion of RF-PRIORIDAD-02, up to 9 confirmations.
  it.each([
    [LOW, 0, 'low'],
    [LOW, 2, 'low'],
    [LOW, 3, 'medium'],
    [LOW, 5, 'medium'],
    [LOW, 6, 'high'],
    [LOW, 9, 'high'],
    [MEDIUM, 0, 'medium'],
    [MEDIUM, 2, 'medium'],
    [MEDIUM, 3, 'high'],
    [MEDIUM, 9, 'high'],
    [HIGH, 0, 'high'],
    [HIGH, 9, 'high'],
  ] as const)(
    'RF-PRIORIDAD-02: severity %i with %i confirmations is %s',
    (severity, confirmations, expected) => {
      expect(toLevel(priority(severity, confirmations))).toBe(expected)
    },
  )

  it('RF-PRIORIDAD-01: a new report takes the severity of its category', () => {
    expect(priority(MEDIUM, 0)).toBe(MEDIUM)
  })

  it('rejects a negative or fractional number of confirmations', () => {
    expect(() => priority(LOW, -1)).toThrow(RangeError)
    expect(() => priority(LOW, 1.5)).toThrow(RangeError)
  })
})

describe('levels', () => {
  it('maps the names to the values stored in the database and back', () => {
    expect([LOW, MEDIUM, HIGH]).toEqual([1, 2, 3])
    expect([1, 2, 3].map(toLevel)).toEqual(['low', 'medium', 'high'])
  })

  it('rejects a value outside the scale', () => {
    expect(() => toLevel(0)).toThrow(RangeError)
    expect(() => toLevel(4)).toThrow(RangeError)
  })
})
