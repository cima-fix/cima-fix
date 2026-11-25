import { and, eq, exists, or, sql, type SQL } from 'drizzle-orm'

import { can } from '../../../shared/domain/permissions.ts'
import { crossedThresholds, type ThresholdSnapshot } from '../../../shared/domain/thresholds.ts'
import { isOpen, nextStatus } from '../../../shared/domain/transitions.ts'
import { reportVisibility } from '../../../shared/domain/visibility.ts'
import type { AssignmentBody, ReportQuery } from '../../../shared/schemas/management.ts'
import type { Viewer } from '../../../shared/types/viewer.ts'
import { withCampusLock, type CampusLockContext } from '../../db/campus-lock.ts'
import { getDb } from '../../db/client.ts'
import { duplicateConfirmations, reports } from '../../db/schema.ts'
import { AppError } from '../../middleware/errors.ts'
import { getReport, listReports, type ReportPage } from '../reports/service.ts'
import type { ReportView } from '../reports/view.ts'
import * as repo from './repository.ts'

// Management of reports that already exist: query, assign, resolve and cancel (SDD 7.2 Gestión,
// 8.3, 9.1). Every action runs with the campus of the report locked (DD-08) and puts the
// conditions on the report in the WHERE of its UPDATE (SDD 10.3); when it updates no row, the
// state read inside the lock explains why.

const unavailable = () => new AppError(404, 'REPORT_UNAVAILABLE', 'El reporte no está disponible.')

const invalidTransition = () =>
  new AppError(409, 'INVALID_TRANSITION', 'El reporte ya no está en un estado que permita esta acción.')

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

// GET /api/reports (RF-GESTION-03, 15, 16, 22, 23). The visibility of RN-06 and the order of
// RF-GESTION-14 come from the report queries; the filters are added to them, all together.
export async function queryReports(viewer: Viewer, query: ReportQuery): Promise<ReportPage> {
  const filters: SQL[] = []
  if (query.campusId) filters.push(eq(reports.campusId, query.campusId))
  if (query.categoryId) filters.push(eq(reports.categoryId, query.categoryId))
  if (query.buildingId) filters.push(eq(reports.buildingId, query.buildingId))
  if (query.status) filters.push(eq(reports.status, query.status))
  // RF-GESTION-15: registered OR confirmed as a duplicate by the account.
  if (query.mine) {
    const confirmed = getDb()
      .select({ one: sql`1` })
      .from(duplicateConfirmations)
      .where(and(eq(duplicateConfirmations.reportId, reports.id), eq(duplicateConfirmations.accountId, viewer.accountId)))
    filters.push(or(eq(reports.reporterId, viewer.accountId), exists(confirmed)) as SQL)
  }
  if (query.assignedToMe) filters.push(eq(reports.assigneeId, viewer.accountId))

  return listReports(viewer, {
    where: filters.length > 0 ? and(...filters) : undefined,
    cursor: query.cursor,
  })
}

// GET /api/reports/:id (RF-GESTION-02, 05, 16, 18…20). Any text is accepted as the id: a link that
// matches no report gets the same notice as one the account cannot see (RF-GESTION-19).
export async function reportDetail(viewer: Viewer, reportId: string): Promise<ReportView> {
  return getReport(viewer, reportId)
}

// GET /api/campuses/:id/buildings/:bid/open-reports (RF-MAPA-16…18): open reports are visible to
// every account, in the order of RF-GESTION-14.
export async function openReportsOfBuilding(
  viewer: Viewer,
  campusId: string,
  buildingId: string,
  cursor?: string,
): Promise<ReportPage> {
  if (!(await repo.buildingInActiveCampus(getDb(), campusId, buildingId))) {
    throw new AppError(404, 'BUILDING_NOT_FOUND', 'El edificio no existe.')
  }
  return listReports(viewer, {
    where: and(eq(reports.campusId, campusId), eq(reports.buildingId, buildingId), eq(reports.isOpen, true)),
    cursor,
  })
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

// A report the account cannot see answers as if it did not exist (SDD 10.4), before any check of
// permissions, so the actions do not reveal it either. Returns its campus, the one every
// permission is checked against (RN-01).
async function campusOfVisibleReport(viewer: Viewer, reportId: string): Promise<string> {
  const facts = await repo.findReportFacts(getDb(), reportId)
  if (!facts || reportVisibility(facts, viewer.roles, new Date()) !== 'visible') throw unavailable()
  return facts.campusId
}

// RN-07 (SDD 9.2): an alert for each threshold the operation reached.
function emitReachedThresholds(
  { emit }: Pick<CampusLockContext, 'emit'>,
  campusId: string,
  actorId: string,
  before: ThresholdSnapshot,
  after: ThresholdSnapshot,
): void {
  for (const status of crossedThresholds(before, after)) {
    emit({
      type: 'ThresholdReached',
      campusId,
      actorId,
      status,
      count: status === 'new' ? after.newCount : after.inReviewCount,
    })
  }
}

// POST /api/reports/:id/assignment (RF-GESTION-01, 06…10, RF-NOTIFICACION-01; SDD 8.3)
export async function assignReport(viewer: Viewer, reportId: string, body: AssignmentBody): Promise<ReportView> {
  const campusId = await campusOfVisibleReport(viewer, reportId)
  if (!can(viewer.roles, 'report.assign', campusId)) {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para asignar reportes de este campus.')
  }

  await withCampusLock(campusId, async (ctx) => {
    const { tx } = ctx
    if (!(await repo.isStaffIn(tx, campusId, body.assigneeId))) {
      throw new AppError(
        409,
        'ASSIGNEE_NOT_ELIGIBLE',
        'Solo puedes asignar el reporte a un encargado de su campus.',
        'assigneeId',
      )
    }

    const state = await repo.findReportState(tx, reportId)
    if (!state) throw unavailable()
    const before = await repo.thresholdSnapshot(tx, campusId)
    const wasNew = state.status === 'new'
    const done = wasNew
      ? await repo.assignNew(tx, reportId, body.assigneeId) // RF-GESTION-07, 08
      : await repo.reassign(tx, reportId, body.assigneeId) // RF-GESTION-09
    if (!done) {
      if (!nextStatus(state.status, 'assign')) throw invalidTransition() // RF-GESTION-11
      throw new AppError(409, 'ALREADY_ASSIGNED', 'El reporte ya está asignado a esa cuenta.', 'assigneeId')
    }

    // A reassignment does not change the counts, so it cannot reach a threshold.
    if (wasNew) {
      emitReachedThresholds(ctx, campusId, viewer.accountId, before, {
        ...before,
        newCount: before.newCount - 1,
        inReviewCount: before.inReviewCount + 1,
      })
    }
    ctx.emit({ type: 'ReportAssigned', campusId, actorId: viewer.accountId, reportId, assigneeId: body.assigneeId })
  })

  return getReport(viewer, reportId)
}

// POST /api/reports/:id/resolution (RF-GESTION-01, 11, 12, 17, RF-NOTIFICACION-02)
export async function resolveReport(viewer: Viewer, reportId: string): Promise<ReportView> {
  const campusId = await campusOfVisibleReport(viewer, reportId)
  // RN-03: neither an admin nor a reporter resolves, in any case.
  if (!can(viewer.roles, 'report.resolveAssigned', campusId)) {
    throw new AppError(403, 'FORBIDDEN', 'Solo el encargado asignado puede resolver este reporte.')
  }

  await withCampusLock(campusId, async (ctx) => {
    const { tx } = ctx
    const before = await repo.thresholdSnapshot(tx, campusId)
    if (!(await repo.resolve(tx, reportId, viewer.accountId))) {
      const state = await repo.findReportState(tx, reportId)
      if (!state) throw unavailable()
      if (!nextStatus(state.status, 'resolve')) throw invalidTransition()
      throw new AppError(409, 'NOT_ASSIGNEE', 'Solo el encargado asignado puede resolver este reporte.')
    }

    emitReachedThresholds(ctx, campusId, viewer.accountId, before, {
      ...before,
      inReviewCount: before.inReviewCount - 1,
    })
    ctx.emit({ type: 'ReportResolved', campusId, actorId: viewer.accountId, reportId })
  })

  // Resolved within 7 × 24 hours: every account can still see it (RN-06).
  return getReport(viewer, reportId)
}

// POST /api/reports/:id/cancellation (RF-GESTION-01, 11, 13, RF-NOTIFICACION-03). Answers nothing:
// a reporter can no longer see the report it cancelled (RN-06).
export async function cancelReport(viewer: Viewer, reportId: string): Promise<void> {
  const campusId = await campusOfVisibleReport(viewer, reportId)
  const canCancelAny = can(viewer.roles, 'report.cancelAny', campusId)
  if (!canCancelAny && !can(viewer.roles, 'report.cancelOwnUnconfirmed', campusId)) {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para cancelar reportes de este campus.')
  }

  await withCampusLock(campusId, async (ctx) => {
    const { tx } = ctx
    // Read under the lock, so it is still the status the UPDATE below changes.
    const state = await repo.findReportState(tx, reportId)
    if (!state) throw unavailable()
    const before = await repo.thresholdSnapshot(tx, campusId)

    if (!(await repo.cancel(tx, reportId, viewer.accountId, canCancelAny))) {
      if (!isOpen(state.status)) throw invalidTransition()
      if (state.reporterId !== viewer.accountId) {
        throw new AppError(409, 'NOT_CANCELLABLE', 'Solo puedes cancelar los reportes que tú registraste.')
      }
      throw new AppError(
        409,
        'HAS_CONFIRMATIONS',
        'No puedes cancelar este reporte porque otras cuentas confirmaron que es el mismo problema.',
      )
    }

    emitReachedThresholds(ctx, campusId, viewer.accountId, before, {
      ...before,
      newCount: before.newCount - (state.status === 'new' ? 1 : 0),
      inReviewCount: before.inReviewCount - (state.status === 'in_review' ? 1 : 0),
    })
    ctx.emit({ type: 'ReportCancelled', campusId, actorId: viewer.accountId, reportId })
  })
}