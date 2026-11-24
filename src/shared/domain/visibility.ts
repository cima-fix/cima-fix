import type { CampusId, ReportStatus } from '../types/common.ts'
import { can, type CampusRoles } from './permissions.ts'
import { isOpen } from './transitions.ts'

// RN-06: 7 periods of 24 hours from the resolution, not 7 calendar days.
export const RESOLVED_VISIBILITY_MS = 7 * 24 * 60 * 60 * 1000

export type ReportVisibilityFacts = {
  campusId: CampusId
  status: ReportStatus
  resolvedAt: Date | null
}

// "resolved_expired" is the case of RF-GESTION-20, which has its own notice; "hidden" covers
// every other report the account cannot see (RF-GESTION-19).
export type ReportVisibility = 'visible' | 'resolved_expired' | 'hidden'

// RN-06 for one report. It matches the SQL predicate of the report queries (SDD 10.4):
// `is_open OR (status = 'resolved' AND resolved_at > now - 7 days) OR managed campus`.
// `now` is a parameter because domain rules do not read the clock (SDD 4.1).
export function reportVisibility(
  report: ReportVisibilityFacts,
  roles: CampusRoles,
  now: Date,
): ReportVisibility {
  if (isOpen(report.status)) return 'visible'

  if (report.status === 'cancelled') {
    return can(roles, 'report.readCancelled', report.campusId) ? 'visible' : 'hidden'
  }

  if (report.resolvedAt === null) {
    throw new Error('A resolved report must have its resolution date.')
  }
  const withinPeriod = now.getTime() - report.resolvedAt.getTime() < RESOLVED_VISIBILITY_MS
  if (withinPeriod || can(roles, 'report.readExpiredResolved', report.campusId)) {
    return 'visible'
  }
  return 'resolved_expired'
}
