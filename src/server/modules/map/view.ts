import { buildingLevel, mapLegend, type LegendEntry, type MapThresholds } from '../../../shared/domain/map-levels.ts'
import type { Level } from '../../../shared/types/common.ts'
import type { PhotoStorage } from '../../integrations/cloudinary.ts'

// A campus with what its map needs, as the map query loads it.
export type CampusMapRecord = {
  campus: { id: string; name: string }
  floorPlan: { publicId: string; width: number; height: number }
  thresholds: MapThresholds | null
  // Every building of the campus, with the number of its open reports.
  buildings: {
    id: string
    name: string
    isActive: boolean
    position: { x: number; y: number } | null
    openCount: number
  }[]
}

export type MapIndicator = {
  building: { id: string; name: string }
  position: { x: number; y: number }
  openCount: number
  level: Level | null
}

// Response of GET /api/campuses/:id/map (SDD 7.2). The text alternative of the map
// (RF-MAPA-15) is the list of indicators itself, so both always show the same buildings.
export type MapView = {
  campus: { id: string; name: string }
  floorPlan: { url: string; width: number; height: number }
  thresholds: MapThresholds | null
  legend: LegendEntry[] | null
  indicators: MapIndicator[]
  // RF-MAPA-11: no building of the campus has a position.
  noPositionedBuildings: boolean
}

export function toMapView(record: CampusMapRecord, photos: PhotoStorage): MapView {
  const indicators: MapIndicator[] = []
  for (const building of record.buildings) {
    // RF-MAPA-05 to 07: active buildings with a position and at least one open report.
    if (!building.isActive || building.position === null || building.openCount === 0) continue
    indicators.push({
      building: { id: building.id, name: building.name },
      position: building.position,
      openCount: building.openCount,
      level: buildingLevel(building.openCount, record.thresholds), // RN-08
    })
  }

  return {
    campus: record.campus,
    floorPlan: {
      url: photos.floorPlanUrl(record.floorPlan.publicId),
      width: record.floorPlan.width,
      height: record.floorPlan.height,
    },
    thresholds: record.thresholds,
    legend: mapLegend(record.thresholds), // RF-MAPA-10
    indicators,
    noPositionedBuildings: record.buildings.every((building) => building.position === null),
  }
}
