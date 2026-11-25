import { Hono } from 'hono'

import { idParam } from '../../../shared/schemas/common.ts'
import { alertThresholdsBody } from '../../../shared/schemas/thresholds.ts'
import { sessionRequired } from '../../middleware/session-required.ts'
import { validate } from '../../middleware/validate.ts'
import { requireViewer } from '../../middleware/viewer.ts'
import type { AppEnv } from '../../types.ts'
import { setAlertThresholds } from './service.ts'

// Notification endpoints (SDD 7.2, Mapa y configuración del campus). Paths are relative to /api.
export const notificationRoutes = new Hono<AppEnv>().put(
  '/campuses/:id/alert-thresholds',
  sessionRequired,
  validate('param', idParam),
  validate('json', alertThresholdsBody),
  async (c) => {
    return c.json(await setAlertThresholds(requireViewer(c), c.req.valid('param').id, c.req.valid('json')))
  },
)