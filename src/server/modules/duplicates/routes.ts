import { Hono } from 'hono'

import { idParam } from '../../../shared/schemas/common.ts'
import { confirmationBody } from '../../../shared/schemas/duplicates.ts'
import { validate } from '../../middleware/validate.ts'
import { requireViewer } from '../../middleware/viewer.ts'
import type { AppEnv } from '../../types.ts'
import { confirmDuplicate } from './service.ts'

// SDD 7.2, Reportes y duplicados. Paths are relative to /api.
export const duplicateRoutes = new Hono<AppEnv>().post(
  '/reports/:id/confirmations',
  validate('param', idParam),
  validate('json', confirmationBody),
  async (c) => {
    const report = await confirmDuplicate(requireViewer(c), c.req.valid('param').id, c.req.valid('json'))
    return c.json(report)
  },
)
