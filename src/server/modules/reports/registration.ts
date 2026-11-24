import { and, count, eq, sql } from 'drizzle-orm'

import { MAX_REPORTS_PER_HOUR } from '../../../shared/domain/limits.ts'
import { crossedThresholds, type ThresholdSnapshot } from '../../../shared/domain/thresholds.ts'
import type { CheckReportBody, CreateReportBody } from '../../../shared/schemas/reports.ts'
import type { Viewer } from '../../../shared/types/viewer.ts'
import { withCampusLock } from '../../db/campus-lock.ts'
import { getDb, type Executor } from '../../db/client.ts'
import { buildings, campuses, categories, reportPhotos, reports, spaces } from '../../db/schema.ts'
import { getPhotoStorage } from '../../integrations/cloudinary.ts'
import { AppError } from '../../middleware/errors.ts'
import { getReport, listPossibleDuplicates } from './service.ts'
import type { ReportView } from './view.ts'

// Registration of a report in two steps (SDD 8.2): the check of the draft, which shows the
// possible duplicates before any photo is uploaded, and the registration itself.

type Selection = Pick<CheckReportBody, 'campusId' | 'buildingId' | 'spaceId' | 'categoryId'>

// RF-REPORTE-12, 13, RF-CATALOGO-10: the same rule as `offeredCatalog`. An active space in an
// active building already means the building has an active space, so the building is offered.
async function requireOffered(db: Executor, selection: Selection): Promise<void> {
  const [row] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .innerJoin(buildings, eq(buildings.id, spaces.buildingId))
    .innerJoin(campuses, eq(campuses.id, buildings.campusId))
    .innerJoin(categories, eq(categories.campusId, campuses.id))
    .where(
      and(
        eq(spaces.id, selection.spaceId),
        eq(spaces.isActive, true),
        eq(buildings.id, selection.buildingId),
        eq(buildings.isActive, true),
        eq(campuses.id, selection.campusId),
        eq(campuses.isActive, true),
        eq(categories.id, selection.categoryId),
        eq(categories.isActive, true),
      ),
    )
  if (!row) {
    throw new AppError(
      422,
      'SELECTION_NOT_OFFERED',
      'El campus, el edificio, el espacio o la categoría elegidos ya no están disponibles.',
    )
  }
}

// RNF-SEGURIDAD-03 (DD-11): reports registered by the account in the last 60 minutes, counted in
// the database, so only reports actually registered count.
async function requireUnderHourlyLimit(db: Executor, accountId: string): Promise<void> {
  const [row] = await db
    .select({ total: count() })
    .from(reports)
    .where(and(eq(reports.reporterId, accountId), sql`${reports.createdAt} > now() - interval '60 minutes'`))
  if ((row?.total ?? 0) >= MAX_REPORTS_PER_HOUR) {
    throw new AppError(
      429,
      'REPORT_LIMIT_REACHED',
      `Alcanzaste el límite de ${MAX_REPORTS_PER_HOUR} reportes por hora. Inténtalo más tarde.`,
    )
  }
}

// POST /api/reports/check (RF-REPORTE-12, 13, RF-DUPLICADO-01, 02, 07, RNF-SEGURIDAD-03). It
// registers nothing; the limit is checked here too, so the account learns it before uploading
// photos (SDD 11).
export async function checkDraft(
  viewer: Viewer,
  draft: CheckReportBody,
  db: Executor = getDb(),
): Promise<{ duplicates: ReportView[] }> {
  await requireOffered(db, draft)
  await requireUnderHourlyLimit(db, viewer.accountId)
  return { duplicates: await listPossibleDuplicates(viewer, draft, db) }
}

export type RegistrationResult =
  | { kind: 'registered'; report: ReportView }
  // The same request sent again: the report it created is returned (SDD 6.2).
  | { kind: 'repeated'; report: ReportView }
  // Possible duplicates that appeared after the check (SDD 8.2).
  | { kind: 'new_duplicates'; duplicates: ReportView[] }

async function thresholdSnapshot(db: Executor, campusId: string): Promise<ThresholdSnapshot> {
  const [row] = await db
    .select({
      newCount: sql<number>`count(*) filter (where ${reports.status} = 'new')::int`,
      inReviewCount: sql<number>`count(*) filter (where ${reports.status} = 'in_review')::int`,
      thresholdNew: campuses.alertThresholdNew,
      thresholdInReview: campuses.alertThresholdInReview,
    })
    .from(campuses)
    .leftJoin(reports, eq(reports.campusId, campuses.id))
    .where(eq(campuses.id, campusId))
    .groupBy(campuses.id)
  return row!
}

function reportIdTaken(): AppError {
  return new AppError(409, 'REPORT_ID_TAKEN', 'No se pudo registrar el reporte. Vuelve a intentarlo.')
}

// POST /api/reports (RF-REPORTE-01…09, 13, 16, RF-DUPLICADO-04, RF-PRIORIDAD-01, RNF-SEGURIDAD-03)
export async function registerReport(viewer: Viewer, body: CreateReportBody): Promise<RegistrationResult> {
  // SDD 10.10: a local computation, so it is done before taking the lock.
  const storage = getPhotoStorage()
  body.photos.forEach((photo, index) => {
    if (!storage.isAuthentic(photo)) {
      throw new AppError(
        422,
        'INVALID_PHOTO',
        'Una de las fotografías no se pudo verificar. Vuelve a adjuntarla.',
        `photos.${index}`,
      )
    }
  })

  // Also checked before the lock, so a campus that does not exist gets the same answer as any
  // other selection that is not offered, instead of the 404 of the lock.
  await requireOffered(getDb(), body)

  const outcome = await withCampusLock(body.campusId, async ({ tx, emit }) => {
    const [existing] = await tx
      .select({ reporterId: reports.reporterId })
      .from(reports)
      .where(eq(reports.id, body.id))
    if (existing) {
      if (existing.reporterId !== viewer.accountId) throw reportIdTaken()
      return 'repeated' as const
    }

    await requireOffered(tx, body)
    await requireUnderHourlyLimit(tx, viewer.accountId)

    const open = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.isOpen, true),
          eq(reports.campusId, body.campusId),
          eq(reports.categoryId, body.categoryId),
          eq(reports.buildingId, body.buildingId),
        ),
      )
    const reviewed = new Set(body.reviewedDuplicateIds)
    if (open.some((report) => !reviewed.has(report.id))) return 'new_duplicates' as const

    const before = await thresholdSnapshot(tx, body.campusId)
    const inserted = await tx
      .insert(reports)
      .values({
        id: body.id,
        campusId: body.campusId,
        buildingId: body.buildingId,
        spaceId: body.spaceId,
        categoryId: body.categoryId,
        description: body.description,
        reporterId: viewer.accountId,
        // RF-PRIORIDAD-01 (SDD 10.1, case 1): the severity in force, read in the same statement.
        priority: sql`(select ${categories.severity} from ${categories} where ${categories.id} = ${body.categoryId})`,
      })
      // A request with the same id that got in through the lock of another campus.
      .onConflictDoNothing({ target: reports.id })
      .returning({ id: reports.id })
    if (inserted.length === 0) throw reportIdTaken()

    if (body.photos.length > 0) {
      await tx.insert(reportPhotos).values(
        body.photos.map((photo, index) => ({
          reportId: body.id,
          publicId: photo.publicId,
          format: photo.format,
          bytes: photo.bytes,
          position: index + 1,
        })),
      )
    }

    // RN-07: only the count of new reports changes.
    const after = { ...before, newCount: before.newCount + 1 }
    for (const status of crossedThresholds(before, after)) {
      emit({
        type: 'ThresholdReached',
        campusId: body.campusId,
        actorId: viewer.accountId,
        status,
        count: status === 'new' ? after.newCount : after.inReviewCount,
      })
    }
    return 'registered' as const
  })

  if (outcome === 'new_duplicates') {
    return { kind: outcome, duplicates: await listPossibleDuplicates(viewer, body) }
  }
  return { kind: outcome, report: await getReport(viewer, body.id) }
}
