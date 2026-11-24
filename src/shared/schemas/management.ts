import * as z from 'zod'

import { REPORT_STATUSES } from '../types/common.ts'
import { id } from './common.ts'

// Input of the management endpoints (SDD 7.2, Gestión).

// POST /api/reports/:id/assignment (RF-GESTION-07, 09). Whether the account is a staff member of
// the campus (RF-GESTION-06) is checked by the service.
export const assignmentBody = z.strictObject({ assigneeId: id })

// Query flags arrive as text; only "1" turns them on.
const flag = z
  .literal('1', { error: 'El filtro solo acepta el valor 1.' })
  .optional()
  .transform((value) => value === '1')

// GET /api/reports (RF-GESTION-03, 15, 22). The category and building filters are offered only
// once a campus is chosen (RF-GESTION-04), so they are rejected without one.
export const reportQuery = z
  .strictObject({
    campusId: id.optional(),
    categoryId: id.optional(),
    buildingId: id.optional(),
    status: z.enum(REPORT_STATUSES, { error: 'El estado no es válido.' }).optional(),
    mine: flag,
    assignedToMe: flag,
    cursor: z.string().min(1).optional(),
  })
  .refine(
    (query) =>
      query.campusId !== undefined ||
      (query.categoryId === undefined && query.buildingId === undefined),
    { error: 'Elige un campus antes de filtrar por categoría o edificio.', path: ['campusId'] },
  )

export type AssignmentBody = z.infer<typeof assignmentBody>
export type ReportQuery = z.infer<typeof reportQuery>
