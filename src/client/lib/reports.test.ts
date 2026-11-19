import { describe, expect, it } from 'vitest'
import { computePriority, isOpen, type Priority, type Report } from './reports'

describe('computePriority', () => {
  // Verification table of RF-PRIORIDAD-02.
  const cases: [Priority, number, Priority][] = [
    ['low', 0, 'low'],
    ['low', 2, 'low'],
    ['low', 3, 'medium'],
    ['low', 5, 'medium'],
    ['low', 6, 'high'],
    ['medium', 0, 'medium'],
    ['medium', 2, 'medium'],
    ['medium', 3, 'high'],
    ['high', 0, 'high'],
    ['high', 9, 'high'],
  ]

  it.each(cases)(
    'RF-PRIORIDAD-02: severity %s with %i confirmations is %s',
    (severity, confirmations, expected) => {
      expect(computePriority(severity, confirmations)).toBe(expected)
    },
  )
})

describe('isOpen', () => {
  const report = (status: Report['status']) => ({ status }) as Report

  it('treats Nuevo and En revisión as open', () => {
    expect(isOpen(report('new'))).toBe(true)
    expect(isOpen(report('in_review'))).toBe(true)
  })

  it('treats Resuelto and Cancelado as closed', () => {
    expect(isOpen(report('resolved'))).toBe(false)
    expect(isOpen(report('cancelled'))).toBe(false)
  })
})
