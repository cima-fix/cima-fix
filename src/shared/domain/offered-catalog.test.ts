import { describe, expect, it } from 'vitest'

import { offeredCatalog } from './offered-catalog.ts'
import { resolveSpaceLink } from './space-link.ts'

const catalog = {
  campus: { id: 'campus', isActive: true },
  buildings: [
    {
      id: 'b-open',
      isActive: true,
      name: 'Edificio 5',
      spaces: [
        { id: 's-open', isActive: true },
        { id: 's-off', isActive: false },
      ],
    },
    { id: 'b-off', isActive: false, name: 'Edificio 2', spaces: [{ id: 's-in-off', isActive: true }] },
    { id: 'b-empty', isActive: true, name: 'Biblioteca', spaces: [{ id: 's-only-off', isActive: false }] },
    { id: 'b-new', isActive: true, name: 'Gimnasio', spaces: [] },
  ],
  categories: [
    { id: 'c-open', isActive: true },
    { id: 'c-off', isActive: false },
  ],
}

describe('offeredCatalog', () => {
  const offered = offeredCatalog(catalog)

  it('RF-CATALOGO-10: offers active buildings with only their active spaces', () => {
    expect(offered?.buildings.map((building) => building.id)).toEqual(['b-open'])
    expect(offered?.buildings[0]?.spaces.map((space) => space.id)).toEqual(['s-open'])
  })

  it('RF-CATALOGO-10: leaves out an active space whose building is deactivated', () => {
    const spaces = offered?.buildings.flatMap((building) => building.spaces.map((space) => space.id))
    expect(spaces).not.toContain('s-in-off')
  })

  it('RF-CATALOGO-10: leaves out an active building without active spaces', () => {
    const ids = offered?.buildings.map((building) => building.id)
    expect(ids).not.toContain('b-empty')
    expect(ids).not.toContain('b-new')
  })

  it('RF-CATALOGO-10: offers only active categories', () => {
    expect(offered?.categories.map((category) => category.id)).toEqual(['c-open'])
  })

  it('keeps the other fields of each item', () => {
    expect(offered?.buildings[0]?.name).toBe('Edificio 5')
  })

  it('RF-REPORTE-12: offers nothing from a campus that is not active', () => {
    expect(offeredCatalog({ ...catalog, campus: { id: 'campus', isActive: false } })).toBeNull()
  })
})

describe('resolveSpaceLink', () => {
  it('RF-REPORTE-05: preselects campus, building and space of an offered space', () => {
    const target = { campusId: 'campus', buildingId: 'b-open', spaceId: 's-open' }
    expect(resolveSpaceLink(target, catalog)).toEqual({
      preselect: { campusId: 'campus', buildingId: 'b-open', spaceId: 's-open' },
      unavailable: false,
    })
  })

  it('RF-REPORTE-10: a deactivated space in an offered building preselects campus and building', () => {
    const target = { campusId: 'campus', buildingId: 'b-open', spaceId: 's-off' }
    expect(resolveSpaceLink(target, catalog)).toEqual({
      preselect: { campusId: 'campus', buildingId: 'b-open' },
      unavailable: true,
    })
  })

  it('RF-REPORTE-10: a space whose building is not offered preselects only the campus', () => {
    for (const [buildingId, spaceId] of [
      ['b-off', 's-in-off'],
      ['b-empty', 's-only-off'],
    ] as const) {
      expect(resolveSpaceLink({ campusId: 'campus', buildingId, spaceId }, catalog)).toEqual({
        preselect: { campusId: 'campus' },
        unavailable: true,
      })
    }
  })

  it('RF-REPORTE-10: a space of a campus that is not active preselects nothing', () => {
    const inactive = { ...catalog, campus: { id: 'campus', isActive: false } }
    const target = { campusId: 'campus', buildingId: 'b-open', spaceId: 's-open' }
    expect(resolveSpaceLink(target, inactive)).toEqual({ preselect: {}, unavailable: true })
  })

  it('RF-REPORTE-10: a link that matches no space preselects nothing', () => {
    expect(resolveSpaceLink(null, null)).toEqual({ preselect: {}, unavailable: true })
  })
})
