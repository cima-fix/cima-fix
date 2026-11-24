import { describe, expect, it } from 'vitest'

import type { StaffRole } from '../types/common'
import type { CampusRoles } from './permissions'
import { RESOLVED_VISIBILITY_MS, reportVisibility, type ReportVisibilityFacts } from './visibility'

const CAMPUS = 'campus-a'
const NOW = new Date('2026-11-23T18:00:00Z')

const reporter: CampusRoles = new Map()
const staff: CampusRoles = new Map<string, StaffRole>([[CAMPUS, 'staff']])
const admin: CampusRoles = new Map<string, StaffRole>([[CAMPUS, 'admin']])
const staffElsewhere: CampusRoles = new Map<string, StaffRole>([['campus-b', 'staff']])

function resolvedAgo(ms: number): ReportVisibilityFacts {
  return { campusId: CAMPUS, status: 'resolved', resolvedAt: new Date(NOW.getTime() - ms) }
}

const cancelled: ReportVisibilityFacts = { campusId: CAMPUS, status: 'cancelled', resolvedAt: null }

describe('reportVisibility', () => {
  it.each(['new', 'in_review'] as const)('RF-GESTION-16: %s reports are visible to every account', (status) => {
    const report: ReportVisibilityFacts = { campusId: CAMPUS, status, resolvedAt: null }
    expect(reportVisibility(report, reporter, NOW)).toBe('visible')
  })

  it('RN-06: cancelled reports are hidden from reporters', () => {
    expect(reportVisibility(cancelled, reporter, NOW)).toBe('hidden')
  })

  it('RN-06: staff and admins of the campus see cancelled reports', () => {
    expect(reportVisibility(cancelled, staff, NOW)).toBe('visible')
    expect(reportVisibility(cancelled, admin, NOW)).toBe('visible')
  })

  it('RN-01: staff of another campus do not see cancelled reports', () => {
    expect(reportVisibility(cancelled, staffElsewhere, NOW)).toBe('hidden')
  })

  it('RN-06: a resolved report is visible to everyone until 7 × 24 hours have passed', () => {
    expect(reportVisibility(resolvedAgo(0), reporter, NOW)).toBe('visible')
    expect(reportVisibility(resolvedAgo(RESOLVED_VISIBILITY_MS - 1), reporter, NOW)).toBe('visible')
  })

  it('RN-06: at exactly 7 × 24 hours the period is over', () => {
    expect(reportVisibility(resolvedAgo(RESOLVED_VISIBILITY_MS), reporter, NOW)).toBe('resolved_expired')
  })

  it('RN-06: the period counts hours, not calendar days', () => {
    // Resolved at 23:59 seven calendar days earlier: 6 days and 18 hours and 1 minute ago.
    const report: ReportVisibilityFacts = {
      campusId: CAMPUS,
      status: 'resolved',
      resolvedAt: new Date('2026-11-16T23:59:00Z'),
    }
    expect(reportVisibility(report, reporter, NOW)).toBe('visible')
  })

  it('RF-GESTION-20: a resolved report out of the period is reported as expired', () => {
    expect(reportVisibility(resolvedAgo(RESOLVED_VISIBILITY_MS * 2), staffElsewhere, NOW)).toBe(
      'resolved_expired',
    )
  })

  it('RN-06: staff and admins of the campus see resolved reports without time limit', () => {
    expect(reportVisibility(resolvedAgo(RESOLVED_VISIBILITY_MS * 10), staff, NOW)).toBe('visible')
    expect(reportVisibility(resolvedAgo(RESOLVED_VISIBILITY_MS * 10), admin, NOW)).toBe('visible')
  })

  it('rejects a resolved report without its resolution date', () => {
    const report: ReportVisibilityFacts = { campusId: CAMPUS, status: 'resolved', resolvedAt: null }
    expect(() => reportVisibility(report, reporter, NOW)).toThrow()
  })
})
