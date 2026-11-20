import { describe, expect, it } from 'vitest'
import {
  compareReports,
  computePriority,
  descriptionLength,
  isOpen,
  type Priority,
  type Report,
} from './reports'

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

describe('compareReports', () => {
  const r = (id: string, status: Report['status'], priority: Priority, createdAt: string) =>
    ({ id, status, priority, createdAt }) as Report

  it('RF-GESTION-14: open first, then higher priority, then oldest, then id', () => {
    const reports = [
      r('closed-high', 'resolved', 'high', '2026-11-01T00:00:00Z'),
      r('open-low', 'new', 'low', '2026-11-01T00:00:00Z'),
      r('open-high-new', 'in_review', 'high', '2026-11-15T00:00:00Z'),
      r('open-high-old', 'new', 'high', '2026-11-10T00:00:00Z'),
      r('b-same', 'new', 'medium', '2026-11-12T00:00:00Z'),
      r('a-same', 'new', 'medium', '2026-11-12T00:00:00Z'),
      r('cancelled-low', 'cancelled', 'low', '2026-11-02T00:00:00Z'),
    ]
    expect(reports.sort(compareReports).map((x) => x.id)).toEqual([
      'open-high-old',
      'open-high-new',
      'a-same',
      'b-same',
      'open-low',
      'closed-high',
      'cancelled-low',
    ])
  })
})

describe('descriptionLength', () => {
  it('SDD 10.8: counts code points of the trimmed text', () => {
    expect(descriptionLength('  hola  ')).toBe(4)
    expect(descriptionLength('💡💡')).toBe(2)
    expect('💡💡'.length).toBe(4)
  })
})
