// What can be chosen when registering a report (RF-CATALOGO-10, RF-REPORTE-12). The options of
// the form and the resolution of a space link both use this function, so that what is
// preselected is always something the form offers (SDD 10.9).

export type CatalogItem = { id: string; isActive: boolean }
export type CatalogBuilding = CatalogItem & { spaces: readonly CatalogItem[] }

export type CampusCatalog<B extends CatalogBuilding, C extends CatalogItem> = {
  campus: CatalogItem
  buildings: readonly B[]
  categories: readonly C[]
}

export type OfferedBuilding<B extends CatalogBuilding> = Omit<B, 'spaces'> & {
  spaces: B['spaces'][number][]
}

export type OfferedCatalog<B extends CatalogBuilding, C extends CatalogItem> = {
  buildings: OfferedBuilding<B>[]
  categories: C[]
}

// Null when the campus is not active: nothing of it is offered. Otherwise, the active buildings
// with their active spaces, leaving out buildings without any active space, and the active
// categories. Every other field of the items is kept as received.
export function offeredCatalog<B extends CatalogBuilding, C extends CatalogItem>(
  catalog: CampusCatalog<B, C>,
): OfferedCatalog<B, C> | null {
  if (!catalog.campus.isActive) return null

  const buildings = catalog.buildings
    .filter((building) => building.isActive)
    .map((building) => ({
      ...building,
      spaces: building.spaces.filter((space) => space.isActive),
    }))
    .filter((building) => building.spaces.length > 0)

  return {
    buildings,
    categories: catalog.categories.filter((category) => category.isActive),
  }
}
