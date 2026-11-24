import { and, eq, ne, sql } from 'drizzle-orm'

import type { ConfirmationBody } from '../../../shared/schemas/duplicates.ts'
import type { Viewer } from '../../../shared/types/viewer.ts'
import { withCampusLock } from '../../db/campus-lock.ts'
import { categories, duplicateConfirmations, reports } from '../../db/schema.ts'
import { AppError } from '../../middleware/errors.ts'
import { getReport } from '../reports/service.ts'
import type { ReportView } from '../reports/view.ts'

function isPrimaryKeyViolation(error: unknown): boolean {
  for (let current = error; current instanceof Object; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === '23505') return true
  }
  return false
}

// POST /api/reports/:id/confirmations (RF-DUPLICADO-03, 05, 06, RF-PRIORIDAD-04; SDD 10.1, case 2).
// Runs with the campus of the draft locked, so it never interleaves with a registration, another
// confirmation or a change of severity of the same category.
export async function confirmDuplicate(
  viewer: Viewer,
  reportId: string,
  draft: ConfirmationBody,
): Promise<ReportView> {
  await withCampusLock(draft.campusId, async ({ tx }) => {
    const [report] = await tx
      .select({ reporterId: reports.reporterId })
      .from(reports)
      .where(eq(reports.id, reportId))
    if (!report) throw new AppError(404, 'REPORT_UNAVAILABLE', 'El reporte no está disponible.')
    if (report.reporterId === viewer.accountId) {
      throw new AppError(409, 'OWN_REPORT', 'No puedes confirmar un reporte que tú registraste.')
    }

    // RN-05 is checked again against the draft, together with the new count and priority, in one
    // statement. The SET expressions read the row before the change.
    const updated = await tx
      .update(reports)
      .set({
        confirmationCount: sql`${reports.confirmationCount} + 1`,
        priority: sql`LEAST(3, ${categories.severity} + (${reports.confirmationCount} + 1) / 3)`,
      })
      .from(categories)
      .where(
        and(
          eq(reports.id, reportId),
          eq(categories.id, reports.categoryId),
          eq(reports.isOpen, true),
          eq(reports.campusId, draft.campusId),
          eq(reports.categoryId, draft.categoryId),
          eq(reports.buildingId, draft.buildingId),
          ne(reports.reporterId, viewer.accountId),
        ),
      )
      .returning({ id: reports.id })
    if (updated.length === 0) {
      throw new AppError(
        409,
        'NOT_CONFIRMABLE',
        'Este reporte ya no corresponde al problema que intentabas registrar.',
      )
    }

    // RF-DUPLICADO-05: the primary key rejects a second confirmation, and the rollback undoes the
    // count and priority above.
    try {
      await tx.insert(duplicateConfirmations).values({ reportId, accountId: viewer.accountId })
    } catch (error) {
      if (isPrimaryKeyViolation(error)) {
        throw new AppError(409, 'ALREADY_CONFIRMED', 'Ya confirmaste este reporte.')
      }
      throw error
    }
  })
  return getReport(viewer, reportId)
}
