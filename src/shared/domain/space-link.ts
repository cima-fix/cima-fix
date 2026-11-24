import {
  offeredCatalog,
  type CampusCatalog,
  type CatalogBuilding,
  type CatalogItem,
} from './offered-catalog.ts'

// Space identified by the code of a link, with the building and campus it belongs to.
export type LinkTarget = { campusId: string; buildingId: string; spaceId: string }

export type SpaceLinkResolution = {
  preselect: { campusId?: string; buildingId?: string; spaceId?: string }
  unavailable: boolean
}

// RF-REPORTE-05 and RF-REPORTE-10 (SDD 10.9). `target` is null when the code matches no space;
// `catalog` is the catalog of the campus of the target. Only what the form offers is
// preselected, and anything less than the whole space comes with the "not available" notice.
export function resolveSpaceLink(
  target: LinkTarget | null,
  catalog: CampusCatalog<CatalogBuilding, CatalogItem> | null,
): SpaceLinkResolution {
  const offered = target && catalog ? offeredCatalog(catalog) : null
  if (target === null || offered === null) {
    return { preselect: {}, unavailable: true }
  }

  const { campusId, buildingId, spaceId } = target
  const building = offered.buildings.find((candidate) => candidate.id === buildingId)
  if (building === undefined) {
    return { preselect: { campusId }, unavailable: true }
  }

  const spaceOffered = building.spaces.some((space) => space.id === spaceId)
  if (!spaceOffered) {
    return { preselect: { campusId, buildingId }, unavailable: true }
  }

  return { preselect: { campusId, buildingId, spaceId }, unavailable: false }
}
