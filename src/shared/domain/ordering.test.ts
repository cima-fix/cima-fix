import { describe, expect, it } from 'vitest'

import type { LevelValue } from './levels.ts'
import { compareReports, type OrderFacts } from './ordering.ts'

function report(
  id: string,
  status: OrderFacts['status'],
  priority: LevelValue,
  createdAt: string,
): OrderFacts {
  return { id, status, priority, createdAt: new Date(createdAt) }
}

function order(reports: OrderFacts[]): string[] {
  return [...reports].sort(compareReports).map((item) => item.id)
}

describe('compareReports', () => {
  it('RF-GESTION-14: an open report comes before a closed one with higher priority', () => {
    const open = report('a', 'new', 1, '2026-11-20T10:00:00Z')
    const resolved = report('b', 'resolved', 3, '2026-11-01T10:00:00Z')
    const cancelled = report('c', 'cancelled', 3, '2026-11-01T10:00:00Z')
    expect(order([resolved, cancelled, open])[0]).toBe('a')
  })

  it('RF-GESTION-14: within a group, higher priority first', () => {
    const low = report('a', 'in_review', 1, '2026-11-01T10:00:00Z')
    const high = report('b', 'new', 3, '2026-11-20T10:00:00Z')
    const medium = report('c', 'new', 2, '2026-11-10T10:00:00Z')
    expect(order([low, medium, high])).toEqual(['b', 'c', 'a'])
  })

  it('RF-GESTION-14: with equal priority, the oldest first', () => {
    const newer = report('a', 'new', 2, '2026-11-20T10:00:00Z')
    const older = report('b', 'in_review', 2, '2026-11-01T10:00:00Z')
    expect(order([newer, older])).toEqual(['b', 'a'])
  })

  it('RF-GESTION-14: resolved and cancelled reports are ordered by the same rules', () => {
    const resolvedLow = report('a', 'resolved', 1, '2026-11-01T10:00:00Z')
    const cancelledHigh = report('b', 'cancelled', 3, '2026-11-02T10:00:00Z')
    expect(order([resolvedLow, cancelledHigh])).toEqual(['b', 'a'])
  })

  it('breaks ties by id, so the order is stable', () => {
    const second = report('b0000000-0000-4000-8000-000000000000', 'new', 2, '2026-11-01T10:00:00Z')
    const first = report('A0000000-0000-4000-8000-000000000000', 'new', 2, '2026-11-01T10:00:00Z')
    expect(order([second, first])).toEqual([first.id, second.id])
  })
})
