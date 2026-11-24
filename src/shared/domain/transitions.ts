import { OPEN_STATUSES, type ReportStatus } from '../types/common.ts'

// "assign" covers both assigning a new report and reassigning one in review (SDD 8.3).
export type ReportAction = 'assign' | 'resolve' | 'cancel'

// RF-GESTION-11 (SDD 9.1): every allowed change of status. Any pair missing from this table is
// rejected, so nothing goes back to "new", nothing reopens a closed report and nothing
// removes an assignment (RF-GESTION-10).
const TRANSITIONS: Readonly<Record<ReportStatus, Partial<Record<ReportAction, ReportStatus>>>> = {
  new: { assign: 'in_review', cancel: 'cancelled' },
  in_review: { assign: 'in_review', resolve: 'resolved', cancel: 'cancelled' },
  resolved: {},
  cancelled: {},
}

// Status after applying the action, or null when the transition is not allowed.
export function nextStatus(status: ReportStatus, action: ReportAction): ReportStatus | null {
  return TRANSITIONS[status][action] ?? null
}

export function isOpen(status: ReportStatus): boolean {
  return (OPEN_STATUSES as readonly ReportStatus[]).includes(status)
}
