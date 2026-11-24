import { and, asc, eq, sql } from 'drizzle-orm'

import { toLevel, toLevelValue } from '../../../shared/domain/levels.ts'
import { nameKey } from '../../../shared/domain/names.ts'
import { offeredCatalog } from '../../../shared/domain/offered-catalog.ts'
import { can } from '../../../shared/domain/permissions.ts'
import { resolveSpaceLink, type SpaceLinkResolution } from '../../../shared/domain/space-link.ts'
import type {
  CreateBuildingBody,
  CreateCategoryBody,
  CreateSpaceBody,
  UpdateBuildingBody,
  UpdateCategoryBody,
  UpdateSpaceBody,
} from '../../../shared/schemas/catalog.ts'
import type { Level } from '../../../shared/types/common.ts'
import type { Viewer } from '../../../shared/types/viewer.ts'
import { withCampusLock } from '../../db/campus-lock.ts'
import { getDb, type Executor } from '../../db/client.ts'
import { buildings, campuses, categories, reports, spaces } from '../../db/schema.ts'
import { AppError } from '../../middleware/errors.ts'
import { generateLinkCode } from './link-code.ts'

// Catalog of each campus: buildings, spaces and categories (SDD 7.2, Catálogo).

export type CampusOption = { id: string; slug: string; name: string }
export type Position = { x: number; y: number }
export type BuildingItem = { id: string; name: string; isActive: boolean; position: Position | null }
export type SpaceItem = { id: string; buildingId: string; name: string; isActive: boolean; linkCode: string }
export type CategoryItem = { id: string; name: string; severity: Level; isActive: boolean }
export type CampusCatalogView = {
  buildings: (BuildingItem & { spaces: Omit<SpaceItem, 'buildingId'>[] })[]
  categories: CategoryItem[]
}
export type Option = { id: string; name: string }
export type ReportOptions = { buildings: (Option & { spaces: Option[] })[]; categories: Option[] }
export type FilterOptions = { buildings: Option[]; categories: Option[] }

type BuildingRow = typeof buildings.$inferSelect
type SpaceRow = typeof spaces.$inferSelect
type CategoryRow = typeof categories.$inferSelect

const campusNotFound = () => new AppError(404, 'CAMPUS_NOT_FOUND', 'El campus no existe.')

// RF-CATALOGO-01 (RN-01, RN-03): the role is always checked against the campus of the item.
function requireAdmin(viewer: Viewer, campusId: string): void {
  if (!can(viewer.roles, 'catalog.manage', campusId)) {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para gestionar el catálogo de este campus.')
  }
}

// RF-CATALOGO-08 (SDD 10.8): the unique indexes on the name key reject a repeated name. The
// error of the driver can come wrapped by Drizzle, so the chain of causes is followed.
function isRepeatedName(error: unknown): boolean {
  for (let current = error; current instanceof Object; current = (current as { cause?: unknown }).cause) {
    const { code, constraint } = current as { code?: unknown; constraint?: unknown }
    if (code === '23505') return typeof constraint === 'string' && constraint.endsWith('_name_key_unique')
  }
  return false
}

async function translateRepeatedName<T>(message: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isRepeatedName(error)) throw new AppError(409, 'NAME_TAKEN', message, 'name')
    throw error
  }
}

function toBuilding(row: BuildingRow): BuildingItem {
  const position =
    row.positionX === null || row.positionY === null ? null : { x: row.positionX, y: row.positionY }
  return { id: row.id, name: row.name, isActive: row.isActive, position }
}

function toSpace(row: SpaceRow): SpaceItem {
  return {
    id: row.id,
    buildingId: row.buildingId,
    name: row.name,
    isActive: row.isActive,
    linkCode: row.linkCode,
  }
}

function toCategory(row: CategoryRow): CategoryItem {
  return { id: row.id, name: row.name, severity: toLevel(row.severity), isActive: row.isActive }
}

async function findCampus(db: Executor, campusId: string) {
  const [campus] = await db.select().from(campuses).where(eq(campuses.id, campusId))
  return campus
}

// Every building with its spaces and every category of the campus, active or not, by name.
async function loadCatalog(db: Executor, campusId: string) {
  const [buildingRows, spaceRows, categoryRows] = await Promise.all([
    db.select().from(buildings).where(eq(buildings.campusId, campusId)).orderBy(asc(buildings.name)),
    db
      .select({ space: spaces })
      .from(spaces)
      .innerJoin(buildings, eq(buildings.id, spaces.buildingId))
      .where(eq(buildings.campusId, campusId))
      .orderBy(asc(spaces.name)),
    db.select().from(categories).where(eq(categories.campusId, campusId)).orderBy(asc(categories.name)),
  ])
  const spacesOf = (buildingId: string) =>
    spaceRows.map((row) => row.space).filter((space) => space.buildingId === buildingId)
  return {
    buildings: buildingRows.map((building) => ({ ...building, spaces: spacesOf(building.id) })),
    categories: categoryRows,
  }
}

// GET /api/campuses (RF-REPORTE-12, RF-GESTION-24, RF-MAPA-04)
export async function listActiveCampuses(db: Executor = getDb()): Promise<CampusOption[]> {
  return db
    .select({ id: campuses.id, slug: campuses.slug, name: campuses.name })
    .from(campuses)
    .where(eq(campuses.isActive, true))
    .orderBy(asc(campuses.name))
}

// GET /api/campuses/:id/report-options (RF-REPORTE-12, RF-CATALOGO-10)
export async function getReportOptions(campusId: string, db: Executor = getDb()): Promise<ReportOptions> {
  const campus = await findCampus(db, campusId)
  if (!campus) throw campusNotFound()
  const offered = offeredCatalog({ campus, ...(await loadCatalog(db, campusId)) })
  if (!offered) throw campusNotFound()
  return {
    buildings: offered.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      spaces: building.spaces.map((space) => ({ id: space.id, name: space.name })),
    })),
    categories: offered.categories.map((category) => ({ id: category.id, name: category.name })),
  }
}

// GET /api/campuses/:id/filter-options (RF-GESTION-04): active buildings whether or not they have
// active spaces, and active categories.
export async function getFilterOptions(campusId: string, db: Executor = getDb()): Promise<FilterOptions> {
  const campus = await findCampus(db, campusId)
  if (!campus?.isActive) throw campusNotFound()
  const catalog = await loadCatalog(db, campusId)
  const active = (items: { id: string; name: string; isActive: boolean }[]) =>
    items.filter((item) => item.isActive).map((item) => ({ id: item.id, name: item.name }))
  return { buildings: active(catalog.buildings), categories: active(catalog.categories) }
}

// GET /api/spaces/link/:code (RF-REPORTE-05, 10; SDD 10.9)
export async function resolveLink(code: string, db: Executor = getDb()): Promise<SpaceLinkResolution> {
  const [target] = await db
    .select({ campusId: buildings.campusId, buildingId: spaces.buildingId, spaceId: spaces.id })
    .from(spaces)
    .innerJoin(buildings, eq(buildings.id, spaces.buildingId))
    .where(eq(spaces.linkCode, code))
  if (!target) return resolveSpaceLink(null, null)
  const campus = await findCampus(db, target.campusId)
  if (!campus) return resolveSpaceLink(null, null)
  return resolveSpaceLink(target, { campus, ...(await loadCatalog(db, target.campusId)) })
}

// GET /api/campuses/:id/catalog (RF-CATALOGO-16, 20)
export async function getCampusCatalog(
  viewer: Viewer,
  campusId: string,
  db: Executor = getDb(),
): Promise<CampusCatalogView> {
  requireAdmin(viewer, campusId)
  const catalog = await loadCatalog(db, campusId)
  return {
    buildings: catalog.buildings.map((building) => ({
      ...toBuilding(building),
      spaces: building.spaces.map((space) => ({
        id: space.id,
        name: space.name,
        isActive: space.isActive,
        linkCode: space.linkCode,
      })),
    })),
    categories: catalog.categories.map(toCategory),
  }
}

// POST /api/campuses/:id/buildings (RF-CATALOGO-02, 08)
export async function createBuilding(
  viewer: Viewer,
  campusId: string,
  body: CreateBuildingBody,
): Promise<BuildingItem> {
  requireAdmin(viewer, campusId)
  return withCampusLock(campusId, ({ tx }) =>
    translateRepeatedName('Ya existe un edificio con ese nombre en este campus.', async () => {
      const [row] = await tx
        .insert(buildings)
        .values({ campusId, name: body.name, nameKey: nameKey(body.name) })
        .returning()
      return toBuilding(row!)
    }),
  )
}

async function hasOpenReports(tx: Executor, column: typeof reports.buildingId | typeof reports.categoryId, id: string) {
  const [row] = await tx
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(column, id), eq(reports.isOpen, true)))
    .limit(1)
  return row !== undefined
}

// PATCH /api/buildings/:id (RF-CATALOGO-03, 09, 13, 19, 21)
export async function updateBuilding(
  viewer: Viewer,
  buildingId: string,
  body: UpdateBuildingBody,
): Promise<BuildingItem> {
  const [found] = await getDb().select().from(buildings).where(eq(buildings.id, buildingId))
  if (!found) throw new AppError(404, 'BUILDING_NOT_FOUND', 'El edificio no existe.')
  requireAdmin(viewer, found.campusId)

  return withCampusLock(found.campusId, async ({ tx }) => {
    const changes: Partial<typeof buildings.$inferInsert> = {}
    if (body.name !== undefined) Object.assign(changes, { name: body.name, nameKey: nameKey(body.name) })
    if (body.isActive !== undefined) changes.isActive = body.isActive
    if (body.position !== undefined) {
      if (body.position !== null) {
        const campus = await findCampus(tx, found.campusId)
        if (body.position.x > campus!.floorPlanWidth || body.position.y > campus!.floorPlanHeight) {
          throw new AppError(400, 'INVALID_INPUT', 'La posición debe estar dentro del plano.', 'position')
        }
      }
      changes.positionX = body.position?.x ?? null
      changes.positionY = body.position?.y ?? null
    }
    // RF-CATALOGO-21, checked with the campus locked so no report is registered in between.
    if (body.isActive === false && (await hasOpenReports(tx, reports.buildingId, buildingId))) {
      throw new AppError(409, 'HAS_OPEN_REPORTS', 'No se puede desactivar un edificio con reportes abiertos.')
    }
    return translateRepeatedName('Ya existe un edificio con ese nombre en este campus.', async () => {
      const [row] = await tx.update(buildings).set(changes).where(eq(buildings.id, buildingId)).returning()
      return toBuilding(row!)
    })
  })
}

// POST /api/buildings/:id/spaces (RF-CATALOGO-04, 08, 14)
export async function createSpace(viewer: Viewer, buildingId: string, body: CreateSpaceBody): Promise<SpaceItem> {
  const [building] = await getDb().select().from(buildings).where(eq(buildings.id, buildingId))
  if (!building) throw new AppError(404, 'BUILDING_NOT_FOUND', 'El edificio no existe.')
  requireAdmin(viewer, building.campusId)

  return withCampusLock(building.campusId, ({ tx }) =>
    translateRepeatedName('Ya existe un espacio con ese nombre en este edificio.', async () => {
      const [row] = await tx
        .insert(spaces)
        .values({ buildingId, name: body.name, nameKey: nameKey(body.name), linkCode: generateLinkCode() })
        .returning()
      return toSpace(row!)
    }),
  )
}

// PATCH /api/spaces/:id (RF-CATALOGO-05, 09, 15). The link code never changes.
export async function updateSpace(viewer: Viewer, spaceId: string, body: UpdateSpaceBody): Promise<SpaceItem> {
  const [found] = await getDb()
    .select({ campusId: buildings.campusId })
    .from(spaces)
    .innerJoin(buildings, eq(buildings.id, spaces.buildingId))
    .where(eq(spaces.id, spaceId))
  if (!found) throw new AppError(404, 'SPACE_NOT_FOUND', 'El espacio no existe.')
  requireAdmin(viewer, found.campusId)

  return withCampusLock(found.campusId, ({ tx }) =>
    translateRepeatedName('Ya existe un espacio con ese nombre en este edificio.', async () => {
      const changes: Partial<typeof spaces.$inferInsert> = {}
      if (body.name !== undefined) Object.assign(changes, { name: body.name, nameKey: nameKey(body.name) })
      if (body.isActive !== undefined) changes.isActive = body.isActive
      const [row] = await tx.update(spaces).set(changes).where(eq(spaces.id, spaceId)).returning()
      return toSpace(row!)
    }),
  )
}

// POST /api/campuses/:id/categories (RF-CATALOGO-06, 08, 18)
export async function createCategory(
  viewer: Viewer,
  campusId: string,
  body: CreateCategoryBody,
): Promise<CategoryItem> {
  requireAdmin(viewer, campusId)
  return withCampusLock(campusId, ({ tx }) =>
    translateRepeatedName('Ya existe una categoría con ese nombre en este campus.', async () => {
      const [row] = await tx
        .insert(categories)
        .values({ campusId, name: body.name, nameKey: nameKey(body.name), severity: toLevelValue(body.severity) })
        .returning()
      return toCategory(row!)
    }),
  )
}

// PATCH /api/categories/:id (RF-CATALOGO-07, 09, 18, 21, RF-PRIORIDAD-05)
export async function updateCategory(
  viewer: Viewer,
  categoryId: string,
  body: UpdateCategoryBody,
): Promise<CategoryItem> {
  const [found] = await getDb().select().from(categories).where(eq(categories.id, categoryId))
  if (!found) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'La categoría no existe.')
  requireAdmin(viewer, found.campusId)

  return withCampusLock(found.campusId, async ({ tx }) => {
    if (body.isActive === false && (await hasOpenReports(tx, reports.categoryId, categoryId))) {
      throw new AppError(409, 'HAS_OPEN_REPORTS', 'No se puede desactivar una categoría con reportes abiertos.')
    }
    const changes: Partial<typeof categories.$inferInsert> = {}
    if (body.name !== undefined) Object.assign(changes, { name: body.name, nameKey: nameKey(body.name) })
    if (body.isActive !== undefined) changes.isActive = body.isActive
    if (body.severity !== undefined) changes.severity = toLevelValue(body.severity)

    const category = await translateRepeatedName('Ya existe una categoría con ese nombre en este campus.', async () => {
      const [row] = await tx.update(categories).set(changes).where(eq(categories.id, categoryId)).returning()
      return toCategory(row!)
    })
    // SDD 10.1, case 3: the open reports take the new severity in the same transaction. Closed
    // reports keep their priority (RF-PRIORIDAD-06).
    if (changes.severity !== undefined) {
      await tx
        .update(reports)
        .set({ priority: sql`LEAST(3, ${changes.severity} + ${reports.confirmationCount} / 3)` })
        .where(and(eq(reports.categoryId, categoryId), eq(reports.isOpen, true)))
    }
    return category
  })
}
