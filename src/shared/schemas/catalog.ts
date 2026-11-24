import * as z from 'zod'

import { LEVELS } from '../types/common'
import { catalogName, id } from './common'

// Input of the catalog endpoints (SDD 7.2, Catálogo). Every body is strict: unknown fields are
// rejected (SDD 7.1).

const isActive = z.boolean({ error: 'El estado debe ser activo o desactivado.' })

// RF-CATALOGO-18
const severity = z.enum(LEVELS, { error: 'La gravedad debe ser Baja, Media o Alta.' })

// Position over the campus plan, in plan coordinates (SDD DD-12). The upper bounds are the
// width and height of the plan, which the service checks against the campus.
const coordinate = z.number({ error: 'La coordenada debe ser un número.' }).min(0, {
  error: 'La posición debe estar dentro del plano.',
})
const position = z.strictObject({ x: coordinate, y: coordinate }).nullable()

function requireSomeField<T extends z.ZodObject>(schema: T) {
  return schema.refine((body) => Object.keys(body).length > 0, {
    error: 'No se indicó ningún cambio.',
  })
}

// POST /api/campuses/:id/buildings (RF-CATALOGO-02)
export const createBuildingBody = z.strictObject({ name: catalogName })

// PATCH /api/buildings/:id (RF-CATALOGO-03, 09, 13, 19). `position: null` removes it.
export const updateBuildingBody = requireSomeField(
  z.strictObject({
    name: catalogName.optional(),
    isActive: isActive.optional(),
    position: position.optional(),
  }),
)

// POST /api/buildings/:id/spaces (RF-CATALOGO-04)
export const createSpaceBody = z.strictObject({ name: catalogName })

// PATCH /api/spaces/:id (RF-CATALOGO-05, 09). The link of a space is not editable
// (RF-CATALOGO-15).
export const updateSpaceBody = requireSomeField(
  z.strictObject({
    name: catalogName.optional(),
    isActive: isActive.optional(),
  }),
)

// POST /api/campuses/:id/categories (RF-CATALOGO-06, 18)
export const createCategoryBody = z.strictObject({ name: catalogName, severity })

// PATCH /api/categories/:id (RF-CATALOGO-07, 09, 18)
export const updateCategoryBody = requireSomeField(
  z.strictObject({
    name: catalogName.optional(),
    severity: severity.optional(),
    isActive: isActive.optional(),
  }),
)

// Path parameters of routes nested under a building of a campus, such as
// /api/campuses/:id/buildings/:bid/open-reports.
export const campusBuildingParams = z.strictObject({ id, bid: id })

export type CreateBuildingBody = z.infer<typeof createBuildingBody>
export type UpdateBuildingBody = z.infer<typeof updateBuildingBody>
export type CreateSpaceBody = z.infer<typeof createSpaceBody>
export type UpdateSpaceBody = z.infer<typeof updateSpaceBody>
export type CreateCategoryBody = z.infer<typeof createCategoryBody>
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>
