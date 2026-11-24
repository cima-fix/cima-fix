import { and, asc, eq, sql } from 'drizzle-orm'

import { can } from '../../../shared/domain/permissions.ts'
import type { MapThresholdsBody } from '../../../shared/schemas/thresholds.ts'
import type { Viewer } from '../../../shared/types/viewer.ts'
import { withCampusLock } from '../../db/campus-lock.ts'
import { getDb, type Executor } from '../../db/client.ts'
import { buildings, campuses, reports } from '../../db/schema.ts'
import { getPhotoStorage } from '../../integrations/cloudinary.ts'
import { AppError } from '../../middleware/errors.ts'
import { toMapView, type MapView } from './view.ts'

const campusNotFound = () => new AppError(404, 'CAMPUS_NOT_FOUND', 'El campus no existe.')

// GET /api/campuses/:id/map (RF-MAPA-01, 04…11, 15). Only active campuses have a map. The data
// is read once per request; the SPA asks again only when the map is opened or reloaded
// (RF-MAPA-20).
export async function getCampusMap(campusId: string, db: Executor = getDb()): Promise<MapView> {
  const [campus] = await db.select().from(campuses).where(eq(campuses.id, campusId))
  if (!campus?.isActive) throw campusNotFound()

  const rows = await db
    .select({
      id: buildings.id,
      name: buildings.name,
      isActive: buildings.isActive,
      positionX: buildings.positionX,
      positionY: buildings.positionY,
      openCount: sql<number>`count(${reports.id})::int`,
    })
    .from(buildings)
    .leftJoin(reports, and(eq(reports.buildingId, buildings.id), eq(reports.isOpen, true)))
    .where(eq(buildings.campusId, campusId))
    .groupBy(buildings.id)
    .orderBy(asc(buildings.name))

  const thresholds =
    campus.mapThresholdMedium === null || campus.mapThresholdHigh === null
      ? null
      : { medium: campus.mapThresholdMedium, high: campus.mapThresholdHigh }

  return toMapView(
    {
      campus: { id: campus.id, name: campus.name },
      floorPlan: {
        publicId: campus.floorPlanPublicId,
        width: campus.floorPlanWidth,
        height: campus.floorPlanHeight,
      },
      thresholds,
      buildings: rows.map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.isActive,
        position:
          row.positionX === null || row.positionY === null ? null : { x: row.positionX, y: row.positionY },
        openCount: row.openCount,
      })),
    },
    getPhotoStorage(),
  )
}

// PUT /api/campuses/:id/map-thresholds (RF-MAPA-21…24). Both are set together, or removed with
// `null`.
export async function setMapThresholds(
  viewer: Viewer,
  campusId: string,
  thresholds: MapThresholdsBody,
): Promise<{ medium: number; high: number } | null> {
  if (!can(viewer.roles, 'mapThresholds.manage', campusId)) {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para configurar el mapa de este campus.')
  }
  return withCampusLock(campusId, async ({ tx }) => {
    await tx
      .update(campuses)
      .set({ mapThresholdMedium: thresholds?.medium ?? null, mapThresholdHigh: thresholds?.high ?? null })
      .where(eq(campuses.id, campusId))
    return thresholds
  })
}
