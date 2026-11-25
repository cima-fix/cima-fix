import { Hono } from 'hono'

import { campusBuildingParams } from '../../../shared/schemas/catalog.ts'
import { idParam } from '../../../shared/schemas/common.ts'
import { assignmentBody, reportQuery } from '../../../shared/schemas/management.ts'
import { sessionRequired } from '../../middleware/session-required.ts'
import { validate } from '../../middleware/validate.ts'
import { requireViewer } from '../../middleware/viewer.ts'
import type { AppEnv } from '../../types.ts'
import {
  assignReport,
  cancelReport,
  openReportsOfBuilding,
  queryReports,
  reportDetail,
  resolveReport,
} from './service.ts'

// Management endpoints (SDD 7.2, Gestión) and the open reports of a building of the map.
// Paths are relative to /api.
export const managementRoutes = new Hono<AppEnv>()
  .get('/reports', sessionRequired, validate('query', reportQuery), async (c) => {
    return c.json(await queryReports(requireViewer(c), c.req.valid('query')))
  })
  // No validation of the id: a link that matches no report gets REPORT_UNAVAILABLE (RF-GESTION-19).
  .get('/reports/:id', sessionRequired, async (c) => {
    return c.json(await reportDetail(requireViewer(c), c.req.param('id')))
  })
  .post(
    '/reports/:id/assignment',
    sessionRequired,
    validate('param', idParam),
    validate('json', assignmentBody),
    async (c) => {
      return c.json(await assignReport(requireViewer(c), c.req.valid('param').id, c.req.valid('json')))
    },
  )
  .post('/reports/:id/resolution', sessionRequired, validate('param', idParam), async (c) => {
    return c.json(await resolveReport(requireViewer(c), c.req.valid('param').id))
  })
  .post('/reports/:id/cancellation', sessionRequired, validate('param', idParam), async (c) => {
    await cancelReport(requireViewer(c), c.req.valid('param').id)
    return c.body(null, 204)
  })
  // The cursor is checked by the report queries (400 INVALID_CURSOR).
  .get('/campuses/:id/buildings/:bid/open-reports', sessionRequired, validate('param', campusBuildingParams), async (c) => {
    const { id, bid } = c.req.valid('param')
    return c.json(await openReportsOfBuilding(requireViewer(c), id, bid, c.req.query('cursor')))
  })