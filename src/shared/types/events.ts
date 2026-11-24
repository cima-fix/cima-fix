import type { OpenStatus, StaffRole } from './common.ts'

// Domain events (SDD 14.1). Services emit them inside the transaction and the notifications
// module turns them into emails after the COMMIT (DD-10). Every event carries the campus it
// comes from, so recipients are looked up only in that campus (RF-NOTIFICACION-12), and the
// account that performed the action, which does not receive the email except for alerts
// (RF-NOTIFICACION-09, 18).

type EventBase = { campusId: string; actorId: string }

// Assignment and reassignment: the email goes to the account left assigned, not to the one
// assigned before (RF-NOTIFICACION-01).
export type ReportAssigned = EventBase & {
  type: 'ReportAssigned'
  reportId: string
  assigneeId: string
}

// RF-NOTIFICACION-02
export type ReportResolved = EventBase & { type: 'ReportResolved'; reportId: string }

// RF-NOTIFICACION-03
export type ReportCancelled = EventBase & { type: 'ReportCancelled'; reportId: string }

// RF-NOTIFICACION-04, 05
export type RoleAssigned = EventBase & {
  type: 'RoleAssigned'
  accountId: string
  role: StaffRole
}

// RN-07, RF-NOTIFICACION-16 to 19: the count is the number of reports with that status in the
// campus once the operation is applied.
export type ThresholdReached = EventBase & {
  type: 'ThresholdReached'
  status: OpenStatus
  count: number
}

export type DomainEvent =
  | ReportAssigned
  | ReportResolved
  | ReportCancelled
  | RoleAssigned
  | ThresholdReached
