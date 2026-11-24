import { and, asc, desc, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import * as z from 'zod'

import type { LevelValue } from '../../../shared/domain/levels.ts'
import { managedCampusIds } from '../../../shared/domain/permissions.ts'
import { RESOLVED_VISIBILITY_MS, reportVisibility } from '../../../shared/domain/visibility.ts'
import { id as idSchema } from '../../../shared/schemas/common.ts'
import { getDb, type Executor } from '../../db/client.ts'
import {
  accounts,
  buildings,
  campuses,
  categories,
  duplicateConfirmations,
  reportPhotos,
  reports,
  spaces,
} from '../../db/schema.ts'
import { getPhotoStorage } from '../../integrations/cloudinary.ts'
import { AppError } from '../../middleware/errors.ts'
import { toReportView, type ReportRecord, type ReportView, type ReportViewer } from './view.ts'

// Report queries with visibility, order and pagination (SDD 7.3, 10.4, 10.5). Every module that
// shows reports goes through this one: the report list and detail (management), the possible
// duplicates (duplicates) and the open reports of a building (map).

// SDD 7.1
export const PAGE_SIZE = 20

// The photo storage is only needed to build the URL of a photo, so a report without photos is
// shown even where Cloudinary is not configured (SDD 12).
const photoUrls = { urls: (photo: { publicId: string }) => getPhotoStorage().urls(photo) }

const reporter = alias(accounts, 'reporter')
const assignee = alias(accounts, 'assignee')

// RN-06 (SDD 10.4). The 7 × 24 hours are counted from `now`, given by the caller, so the list and
// the detail use the same moment and the tests can fix it.
export function visibleTo(viewer: ReportViewer, now: Date): SQL {
  const cutoff = new Date(now.getTime() - RESOLVED_VISIBILITY_MS)
  return or(
    eq(reports.isOpen, true),
    and(eq(reports.status, 'resolved'), gt(reports.resolvedAt, cutoff)),
    inArray(reports.campusId, managedCampusIds(viewer.roles)),
  ) as SQL
}

// RF-GESTION-14 (SDD 10.5)
const ORDER = [desc(reports.isOpen), desc(reports.priority), asc(reports.createdAt), asc(reports.id)]

function selectReports(db: Executor, viewer: ReportViewer) {
  return db
    .select({
      id: reports.id,
      campusId: campuses.id,
      campusName: campuses.name,
      buildingId: buildings.id,
      buildingName: buildings.name,
      spaceId: spaces.id,
      spaceName: spaces.name,
      categoryId: categories.id,
      categoryName: categories.name,
      description: reports.description,
      status: reports.status,
      isOpen: reports.isOpen,
      priority: reports.priority,
      confirmationCount: reports.confirmationCount,
      createdAt: reports.createdAt,
      // Exact text of the timestamp, so the cursor keeps its microseconds.
      createdAtText: sql<string>`${reports.createdAt}::text`,
      resolvedAt: reports.resolvedAt,
      reporterId: reporter.id,
      reporterEmail: reporter.email,
      assigneeId: assignee.id,
      assigneeEmail: assignee.email,
      confirmedByViewer: sql<boolean>`exists (
        select 1 from ${duplicateConfirmations}
        where ${duplicateConfirmations.reportId} = ${reports.id}
          and ${duplicateConfirmations.accountId} = ${viewer.accountId}
      )`,
    })
    .from(reports)
    .innerJoin(campuses, eq(campuses.id, reports.campusId))
    .innerJoin(buildings, eq(buildings.id, reports.buildingId))
    .innerJoin(spaces, eq(spaces.id, reports.spaceId))
    .innerJoin(categories, eq(categories.id, reports.categoryId))
    .innerJoin(reporter, eq(reporter.id, reports.reporterId))
    .leftJoin(assignee, eq(assignee.id, reports.assigneeId))
}

type ReportRow = Awaited<ReturnType<ReturnType<typeof selectReports>['execute']>>[number]

async function toRecords(db: Executor, rows: ReportRow[]): Promise<ReportRecord[]> {
  const ids = rows.map((row) => row.id)
  const photos =
    ids.length === 0
      ? []
      : await db
          .select({ reportId: reportPhotos.reportId, publicId: reportPhotos.publicId })
          .from(reportPhotos)
          .where(inArray(reportPhotos.reportId, ids))
          .orderBy(asc(reportPhotos.position))

  return rows.map((row) => ({
    id: row.id,
    campus: { id: row.campusId, name: row.campusName },
    building: { id: row.buildingId, name: row.buildingName },
    space: { id: row.spaceId, name: row.spaceName },
    category: { id: row.categoryId, name: row.categoryName },
    description: row.description,
    status: row.status,
    priority: row.priority as LevelValue,
    confirmationCount: row.confirmationCount,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    reporter: { id: row.reporterId, email: row.reporterEmail },
    assignee:
      row.assigneeId === null || row.assigneeEmail === null
        ? null
        : { id: row.assigneeId, email: row.assigneeEmail },
    photos: photos
      .filter((photo) => photo.reportId === row.id)
      .map((photo) => ({ publicId: photo.publicId })),
  }))
}

// The cursor is opaque for the SPA (SDD 7.1): the sort key of the last report of the page.
const cursorSchema = z.strictObject({
  open: z.boolean(),
  priority: z.int().min(1).max(3),
  createdAt: z.string().min(1),
  id: idSchema,
})
type Cursor = z.infer<typeof cursorSchema>

function encodeCursor(row: ReportRow): string {
  const cursor: Cursor = {
    open: row.isOpen === true,
    priority: row.priority,
    createdAt: row.createdAtText,
    id: row.id,
  }
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeCursor(text: string): Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(text, 'base64url').toString('utf8')))
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'La página solicitada no es válida.', 'cursor')
  }
}

// Reports that come after the cursor in the order of SDD 10.5.
function after(cursor: Cursor): SQL {
  const createdAt = sql`${cursor.createdAt}::timestamptz`
  const sameOpen = eq(reports.isOpen, cursor.open)
  const samePriority = eq(reports.priority, cursor.priority)
  return or(
    cursor.open ? eq(reports.isOpen, false) : sql`false`,
    and(sameOpen, sql`${reports.priority} < ${cursor.priority}`),
    and(sameOpen, samePriority, sql`${reports.createdAt} > ${createdAt}`),
    and(sameOpen, samePriority, sql`${reports.createdAt} = ${createdAt}`, gt(reports.id, cursor.id)),
  ) as SQL
}

export type ReportPage = { reports: ReportView[]; nextCursor: string | null }

export type ListReportsOptions = {
  // Extra conditions of the caller, such as the filters of GET /api/reports.
  where?: SQL
  cursor?: string
  // The possible duplicates of a draft can be confirmed (SDD 8.2).
  asPossibleDuplicates?: boolean
  now?: Date
  db?: Executor
}

// Reports the viewer can see, in the order of RF-GESTION-14, one page at a time.
export async function listReports(
  viewer: ReportViewer,
  options: ListReportsOptions = {},
): Promise<ReportPage> {
  const db = options.db ?? getDb()
  const now = options.now ?? new Date()
  const conditions = [visibleTo(viewer, now), options.where]
  if (options.cursor !== undefined) conditions.push(after(decodeCursor(options.cursor)))

  const rows = await selectReports(db, viewer)
    .where(and(...conditions))
    .orderBy(...ORDER)
    .limit(PAGE_SIZE + 1)

  const page = rows.slice(0, PAGE_SIZE)
  const last = page.at(-1)
  const records = await toRecords(db, page)

  return {
    reports: records.map((record, index) =>
      toReportView(record, viewer, {
        photos: photoUrls,
        asPossibleDuplicate: options.asPossibleDuplicates,
        confirmedByViewer: page[index]?.confirmedByViewer === true,
      }),
    ),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  }
}

function unavailable(): AppError {
  return new AppError(404, 'REPORT_UNAVAILABLE', 'El reporte no está disponible.')
}

// One report, or the notice of RF-GESTION-19 or 20. Neither notice includes data of the report,
// and "does not exist" cannot be told apart from "cannot see it" (SDD 10.4).
export async function getReport(
  viewer: ReportViewer,
  reportId: string,
  options: Pick<ListReportsOptions, 'now' | 'db'> = {},
): Promise<ReportView> {
  if (!idSchema.safeParse(reportId).success) throw unavailable()

  const db = options.db ?? getDb()
  const [row] = await selectReports(db, viewer).where(eq(reports.id, reportId))
  if (!row) throw unavailable()

  const visibility = reportVisibility(
    { campusId: row.campusId, status: row.status, resolvedAt: row.resolvedAt },
    viewer.roles,
    options.now ?? new Date(),
  )
  if (visibility === 'resolved_expired') {
    throw new AppError(
      404,
      'REPORT_RESOLVED_EXPIRED',
      'Este reporte fue resuelto y ya no se muestra porque pasaron más de 7 días.',
    )
  }
  if (visibility === 'hidden') throw unavailable()

  const [record] = await toRecords(db, [row])
  if (!record) throw unavailable()
  return toReportView(record, viewer, {
    photos: photoUrls,
    confirmedByViewer: row.confirmedByViewer === true,
  })
}

export type DraftLocation = { campusId: string; categoryId: string; buildingId: string }

// RN-05 (SDD 10.2): open reports of the same campus, category and building, with no time window
// and no text comparison. All of them are open, so they come in the order of RF-GESTION-14. The
// whole list is returned, not a page, because RF-DUPLICADO-01 shows every possible duplicate.
export async function listPossibleDuplicates(
  viewer: ReportViewer,
  draft: DraftLocation,
  db: Executor = getDb(),
): Promise<ReportView[]> {
  const rows = await selectReports(db, viewer)
    .where(
      and(
        eq(reports.isOpen, true),
        eq(reports.campusId, draft.campusId),
        eq(reports.categoryId, draft.categoryId),
        eq(reports.buildingId, draft.buildingId),
      ),
    )
    .orderBy(...ORDER)
  const records = await toRecords(db, rows)
  return records.map((record, index) =>
    toReportView(record, viewer, {
      photos: photoUrls,
      asPossibleDuplicate: true,
      confirmedByViewer: rows[index]?.confirmedByViewer === true,
    }),
  )
}
