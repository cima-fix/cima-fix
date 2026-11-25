import { and, eq, ne, sql } from 'drizzle-orm'

import type { ThresholdSnapshot } from '../../../shared/domain/thresholds.ts'
import type { Executor } from '../../db/client.ts'
import { buildings, campuses, campusRoles, reports } from '../../db/schema.ts'

// Queries of the management module. Other modules use management only through service.ts
// (SDD 5.2). Reading the reports themselves goes through reports/service.ts.

// What decides whether the viewer can see a report (RN-06) and which campus to lock. The campus
// of a report never changes, so it can be read before taking the lock.
export async function findReportFacts(db: Executor, reportId: string) {
  const [row] = await db
    .select({ campusId: reports.campusId, status: reports.status, resolvedAt: reports.resolvedAt })
    .from(reports)
    .where(eq(reports.id, reportId))
  return row
}

// Everything the explanation of a rejected action needs, read again inside the lock.
export async function findReportState(db: Executor, reportId: string) {
  const [row] = await db
    .select({
      status: reports.status,
      assigneeId: reports.assigneeId,
      reporterId: reports.reporterId,
      confirmationCount: reports.confirmationCount,
    })
    .from(reports)
    .where(eq(reports.id, reportId))
  return row
}

// RN-07 (SDD 9.2): counts and thresholds of the campus, read inside the transaction that holds
// the campus lock.
export async function thresholdSnapshot(db: Executor, campusId: string): Promise<ThresholdSnapshot> {
  const [row] = await db
    .select({
      newCount: sql<number>`count(${reports.id}) filter (where ${reports.status} = 'new')::int`,
      inReviewCount: sql<number>`count(${reports.id}) filter (where ${reports.status} = 'in_review')::int`,
      thresholdNew: campuses.alertThresholdNew,
      thresholdInReview: campuses.alertThresholdInReview,
    })
    .from(campuses)
    .leftJoin(reports, eq(reports.campusId, campuses.id))
    .where(eq(campuses.id, campusId))
    .groupBy(campuses.id)
  if (!row) throw new Error('Campus not found for the threshold snapshot')
  return row
}

// RF-GESTION-06: only staff of the campus of the report can be assigned.
export async function isStaffIn(db: Executor, campusId: string, accountId: string) {
  const [row] = await db
    .select({ role: campusRoles.role })
    .from(campusRoles)
    .where(and(eq(campusRoles.campusId, campusId), eq(campusRoles.accountId, accountId)))
  return row?.role === 'staff'
}

// SDD 8.3: the condition on the status goes in the UPDATE itself, so of two simultaneous
// assignments the second one updates no row.
export async function assignNew(db: Executor, reportId: string, assigneeId: string) {
  const rows = await db
    .update(reports)
    .set({ status: 'in_review', assigneeId })
    .where(and(eq(reports.id, reportId), eq(reports.status, 'new')))
    .returning({ id: reports.id })
  return rows.length > 0
}

// RF-GESTION-09: the status stays in review and the assignee changes to another account.
export async function reassign(db: Executor, reportId: string, assigneeId: string) {
  const rows = await db
    .update(reports)
    .set({ assigneeId })
    .where(and(eq(reports.id, reportId), eq(reports.status, 'in_review'), ne(reports.assigneeId, assigneeId)))
    .returning({ id: reports.id })
  return rows.length > 0
}

// RF-GESTION-12, 17 (SDD 10.3): only the staff member it is assigned to, while it is in review.
export async function resolve(db: Executor, reportId: string, accountId: string) {
  const rows = await db
    .update(reports)
    .set({ status: 'resolved', resolvedAt: sql`now()` })
    .where(and(eq(reports.id, reportId), eq(reports.status, 'in_review'), eq(reports.assigneeId, accountId)))
    .returning({ id: reports.id })
  return rows.length > 0
}

// RF-GESTION-13 (SDD 10.3): `WHERE id AND is_open AND (canCancelAny OR (reporter_id = me AND
// confirmation_count = 0))`.
export async function cancel(db: Executor, reportId: string, accountId: string, canCancelAny: boolean) {
  const rows = await db
    .update(reports)
    .set({ status: 'cancelled', cancelledAt: sql`now()` })
    .where(
      and(
        eq(reports.id, reportId),
        eq(reports.isOpen, true),
        canCancelAny ? sql`true` : and(eq(reports.reporterId, accountId), eq(reports.confirmationCount, 0)),
      ),
    )
    .returning({ id: reports.id })
  return rows.length > 0
}

// RF-MAPA-16: the building must belong to the campus of the route, and the campus must be active,
// like the map it comes from.
export async function buildingInActiveCampus(db: Executor, campusId: string, buildingId: string) {
  const [row] = await db
    .select({ id: buildings.id })
    .from(buildings)
    .innerJoin(campuses, eq(campuses.id, buildings.campusId))
    .where(and(eq(buildings.id, buildingId), eq(buildings.campusId, campusId), eq(campuses.isActive, true)))
  return row !== undefined
}