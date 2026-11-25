import { and, asc, eq, inArray } from 'drizzle-orm'

import type { AlertThresholdsBody } from '../../../shared/schemas/thresholds.ts'
import type { Executor } from '../../db/client.ts'
import {
  accounts,
  buildings,
  campuses,
  campusRoles,
  categories,
  duplicateConfirmations,
  reports,
  spaces,
} from '../../db/schema.ts'

// Queries of the notifications module. They run after the COMMIT, so they read the state the
// action left (SDD 14.1).

// The report an event refers to, with what its email shows (RF-NOTIFICACION-06) and what decides
// whether a recipient can still see it (RF-NOTIFICACION-08).
export async function findReport(db: Executor, reportId: string) {
  const [row] = await db
    .select({
      campusId: reports.campusId,
      campus: campuses.name,
      building: buildings.name,
      space: spaces.name,
      category: categories.name,
      createdAt: reports.createdAt,
      status: reports.status,
      resolvedAt: reports.resolvedAt,
      reporterId: reports.reporterId,
      assigneeId: reports.assigneeId,
    })
    .from(reports)
    .innerJoin(campuses, eq(campuses.id, reports.campusId))
    .innerJoin(buildings, eq(buildings.id, reports.buildingId))
    .innerJoin(spaces, eq(spaces.id, reports.spaceId))
    .innerJoin(categories, eq(categories.id, reports.categoryId))
    .where(eq(reports.id, reportId))
  return row
}

// Accounts that confirmed the report as a duplicate (RF-NOTIFICACION-02, 03).
export async function findConfirmers(db: Executor, reportId: string): Promise<string[]> {
  const rows = await db
    .select({ accountId: duplicateConfirmations.accountId })
    .from(duplicateConfirmations)
    .where(eq(duplicateConfirmations.reportId, reportId))
    .orderBy(asc(duplicateConfirmations.createdAt))
  return rows.map((row) => row.accountId)
}

// Email of each account and its role in the campus of the event, nothing from other campuses
// (RF-NOTIFICACION-12). `role` is null for a reporter.
export async function findRecipients(db: Executor, campusId: string, accountIds: string[]) {
  if (accountIds.length === 0) return []
  return db
    .select({ accountId: accounts.id, email: accounts.email, role: campusRoles.role })
    .from(accounts)
    .leftJoin(campusRoles, and(eq(campusRoles.accountId, accounts.id), eq(campusRoles.campusId, campusId)))
    .where(inArray(accounts.id, accountIds))
}

// RF-NOTIFICACION-18: every staff member and admin of the campus.
export async function findCampusStaff(db: Executor, campusId: string): Promise<string[]> {
  const rows = await db
    .select({ accountId: campusRoles.accountId })
    .from(campusRoles)
    .where(eq(campusRoles.campusId, campusId))
  return rows.map((row) => row.accountId)
}

export async function findCampusName(db: Executor, campusId: string): Promise<string | undefined> {
  const [row] = await db.select({ name: campuses.name }).from(campuses).where(eq(campuses.id, campusId))
  return row?.name
}

// RF-NOTIFICACION-14: each threshold is set or removed (null) on its own.
export async function updateAlertThresholds(db: Executor, campusId: string, body: AlertThresholdsBody) {
  await db
    .update(campuses)
    .set({ alertThresholdNew: body.new, alertThresholdInReview: body.inReview })
    .where(eq(campuses.id, campusId))
}