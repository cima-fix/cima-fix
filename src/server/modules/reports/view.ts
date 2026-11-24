import { toLevel, type LevelValue } from '../../../shared/domain/levels'
import { can, type CampusRoles } from '../../../shared/domain/permissions'
import { isOpen, nextStatus } from '../../../shared/domain/transitions'
import type { Level, ReportStatus } from '../../../shared/types/common'
import type { PhotoStorage, PhotoUrls } from '../../integrations/cloudinary'

// A report with everything the views need, as the report queries load it.
export type ReportRecord = {
  id: string
  campus: { id: string; name: string }
  building: { id: string; name: string }
  space: { id: string; name: string }
  category: { id: string; name: string }
  description: string
  status: ReportStatus
  priority: LevelValue
  confirmationCount: number
  createdAt: Date
  resolvedAt: Date | null
  reporter: { id: string; email: string }
  assignee: { id: string; email: string } | null
  // Ordered by their position in the report.
  photos: { publicId: string; version: number }[]
}

// The account that asks for the report and its role in each campus where it is not a reporter.
export type ReportViewer = { accountId: string; roles: CampusRoles }

export type ReportAction = 'assign' | 'resolve' | 'cancel' | 'confirm'

// SDD 7.3: the only shape in which a report leaves the API.
export type ReportView = {
  id: string
  campus: { id: string; name: string }
  building: { id: string; name: string }
  space: { id: string; name: string }
  category: { id: string; name: string }
  description: string
  photos: PhotoUrls[]
  status: ReportStatus
  priority: Level
  confirmationCount: number
  createdAt: string
  resolvedAt: string | null
  reporterEmail?: string
  assigneeEmail?: string | null
  allowedActions: ReportAction[]
}

export type ReportViewContext = {
  photos: PhotoStorage
  // True when the report is shown as a possible duplicate of the draft being registered: only
  // then can it be confirmed (RF-DUPLICADO-03, 06).
  asPossibleDuplicate?: boolean
  // Whether the viewer already confirmed this report (RF-DUPLICADO-05).
  confirmedByViewer?: boolean
}

// Actions the SPA may offer. They only decide which buttons are shown; every action checks its
// permission and its conditions again when it runs (SDD 7.3, 10.3).
export function allowedActions(
  report: ReportRecord,
  viewer: ReportViewer,
  context: Pick<ReportViewContext, 'asPossibleDuplicate' | 'confirmedByViewer'> = {},
): ReportAction[] {
  const campusId = report.campus.id
  const ownReport = report.reporter.id === viewer.accountId
  const actions: ReportAction[] = []

  // RF-GESTION-07, 09: assigning a new report or reassigning one in review.
  if (can(viewer.roles, 'report.assign', campusId) && nextStatus(report.status, 'assign')) {
    actions.push('assign')
  }

  // RN-03: only the staff member the report is assigned to resolves it.
  if (
    can(viewer.roles, 'report.resolveAssigned', campusId) &&
    report.assignee?.id === viewer.accountId &&
    nextStatus(report.status, 'resolve')
  ) {
    actions.push('resolve')
  }

  // RN-03: staff and admins cancel any report of their campus; everyone else, the ones they
  // registered while they have no duplicate confirmations.
  const mayCancel =
    can(viewer.roles, 'report.cancelAny', campusId) ||
    (can(viewer.roles, 'report.cancelOwnUnconfirmed', campusId) &&
      ownReport &&
      report.confirmationCount === 0)
  if (mayCancel && nextStatus(report.status, 'cancel')) {
    actions.push('cancel')
  }

  // RF-DUPLICADO-05, 06: an open possible duplicate that the viewer did not register and has not
  // confirmed yet.
  if (
    context.asPossibleDuplicate === true &&
    isOpen(report.status) &&
    !ownReport &&
    context.confirmedByViewer !== true
  ) {
    actions.push('confirm')
  }

  return actions
}

// SDD 7.3. RN-04: the reporter and assignee emails are not sent at all to an account without
// permission to see them in the campus of the report; the SPA does not merely hide them.
export function toReportView(
  report: ReportRecord,
  viewer: ReportViewer,
  context: ReportViewContext,
): ReportView {
  const view: ReportView = {
    id: report.id,
    campus: report.campus,
    building: report.building,
    space: report.space,
    category: report.category,
    description: report.description,
    photos: report.photos.map((photo) => context.photos.urls(photo)),
    status: report.status,
    priority: toLevel(report.priority),
    confirmationCount: report.confirmationCount,
    createdAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    allowedActions: allowedActions(report, viewer, context),
  }

  if (can(viewer.roles, 'report.viewEmails', report.campus.id)) {
    view.reporterEmail = report.reporter.email
    view.assigneeEmail = report.assignee?.email ?? null
  }

  return view
}
