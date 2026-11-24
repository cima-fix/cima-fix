import { Hono } from 'hono'

import { idParam } from '../../../shared/schemas/common.ts'
import { mapThresholdsBody } from '../../../shared/schemas/thresholds.ts'
import { validate } from '../../middleware/validate.ts'
import { requireViewer } from '../../middleware/viewer.ts'
import type { AppEnv } from '../../types.ts'
import { getCampusMap, setMapThresholds } from './service.ts'

// SDD 7.2, Mapa y configuración del campus. Paths are relative to /api.
export const mapRoutes = new Hono<AppEnv>()
  .get('/campuses/:id/map', validate('param', idParam), async (c) => {
    requireViewer(c)
    return c.json(await getCampusMap(c.req.valid('param').id))
  })
  .put('/campuses/:id/map-thresholds', validate('param', idParam), validate('json', mapThresholdsBody), async (c) => {
    return c.json(await setMapThresholds(requireViewer(c), c.req.valid('param').id, c.req.valid('json')))
  })
