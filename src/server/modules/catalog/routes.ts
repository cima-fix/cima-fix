import { Hono } from 'hono'

import {
  createBuildingBody,
  createCategoryBody,
  createSpaceBody,
  linkCodeParam,
  updateBuildingBody,
  updateCategoryBody,
  updateSpaceBody,
} from '../../../shared/schemas/catalog.ts'
import { idParam } from '../../../shared/schemas/common.ts'
import { validate } from '../../middleware/validate.ts'
import { requireViewer } from '../../middleware/viewer.ts'
import type { AppEnv } from '../../types.ts'
import {
  createBuilding,
  createCategory,
  createSpace,
  getCampusCatalog,
  getFilterOptions,
  getReportOptions,
  listActiveCampuses,
  resolveLink,
  updateBuilding,
  updateCategory,
  updateSpace,
} from './service.ts'

// Catalog endpoints (SDD 7.2, Catálogo). Paths are relative to /api.
export const catalogRoutes = new Hono<AppEnv>()
  .get('/campuses', async (c) => {
    requireViewer(c)
    return c.json(await listActiveCampuses())
  })
  .get('/campuses/:id/report-options', validate('param', idParam), async (c) => {
    requireViewer(c)
    return c.json(await getReportOptions(c.req.valid('param').id))
  })
  .get('/campuses/:id/filter-options', validate('param', idParam), async (c) => {
    requireViewer(c)
    return c.json(await getFilterOptions(c.req.valid('param').id))
  })
  .get('/spaces/link/:code', validate('param', linkCodeParam), async (c) => {
    requireViewer(c)
    return c.json(await resolveLink(c.req.valid('param').code))
  })
  .get('/campuses/:id/catalog', validate('param', idParam), async (c) => {
    return c.json(await getCampusCatalog(requireViewer(c), c.req.valid('param').id))
  })
  .post(
    '/campuses/:id/buildings',
    validate('param', idParam),
    validate('json', createBuildingBody),
    async (c) => {
      const building = await createBuilding(requireViewer(c), c.req.valid('param').id, c.req.valid('json'))
      return c.json(building, 201)
    },
  )
  .patch('/buildings/:id', validate('param', idParam), validate('json', updateBuildingBody), async (c) => {
    return c.json(await updateBuilding(requireViewer(c), c.req.valid('param').id, c.req.valid('json')))
  })
  .post('/buildings/:id/spaces', validate('param', idParam), validate('json', createSpaceBody), async (c) => {
    const space = await createSpace(requireViewer(c), c.req.valid('param').id, c.req.valid('json'))
    return c.json(space, 201)
  })
  .patch('/spaces/:id', validate('param', idParam), validate('json', updateSpaceBody), async (c) => {
    return c.json(await updateSpace(requireViewer(c), c.req.valid('param').id, c.req.valid('json')))
  })
  .post(
    '/campuses/:id/categories',
    validate('param', idParam),
    validate('json', createCategoryBody),
    async (c) => {
      const category = await createCategory(requireViewer(c), c.req.valid('param').id, c.req.valid('json'))
      return c.json(category, 201)
    },
  )
  .patch('/categories/:id', validate('param', idParam), validate('json', updateCategoryBody), async (c) => {
    return c.json(await updateCategory(requireViewer(c), c.req.valid('param').id, c.req.valid('json')))
  })
