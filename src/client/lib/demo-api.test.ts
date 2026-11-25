import { describe, expect, it } from 'vitest'
import {
  ApiError,
  assignRole,
  confirmReport,
  createBuilding,
  findSimilarReports,
  getCampusMap,
  getCatalog,
  getThresholds,
  listReports,
  removeRole,
  renameSpace,
  resolveSpaceCode,
  setAlertThresholds,
  setBuildingActive,
  setCategoryActive,
  setMapThresholds,
  getManagedCatalog,
} from './demo-api'
import { isOpen } from './reports'

describe('getCampusMap', () => {
  it('RF-MAPA-08: each count equals the open reports of the building', async () => {
    const [{ buildings }, reports] = await Promise.all([getCampusMap(), listReports()])
    for (const building of buildings) {
      const open = reports.filter((r) => r.building === building.name && isOpen(r)).length
      expect(building.openReports, building.name).toBe(open)
    }
  })

  it('RN-08: levels follow the RF-MAPA-10 example thresholds', async () => {
    const { thresholds, buildings } = await getCampusMap()
    expect(thresholds).toEqual({ medium: 3, high: 6 })
    expect(buildings.find((b) => b.name === 'Edificio 5')?.level).toBe('medium')
    expect(buildings.find((b) => b.name === 'Edificio 2')?.level).toBe('low')
  })
})

describe('findSimilarReports', () => {
  it('RF-DUPLICADO-07: returns open look-alikes in the RF-GESTION-14 order', async () => {
    const similar = await findSimilarReports({
      campus: 'Campus Sauzal',
      building: 'Edificio 5',
      space: 'Salón 204',
      category: 'Iluminación',
      description: 'x',
      photoCount: 0,
    })
    expect(similar.map((r) => r.id)).toEqual(['r-3', 'r-1', 'r-4', 'r-6'])
  })
})

describe('confirmReport', () => {
  it('RF-DUPLICADO-05: rejects confirming your own report', async () => {
    await expect(confirmReport('r-6')).rejects.toMatchObject({ code: 'OWN_REPORT' })
  })

  it('RF-DUPLICADO-05: rejects a second confirmation from the same account', async () => {
    await expect(confirmReport('r-4')).rejects.toMatchObject({ code: 'ALREADY_CONFIRMED' })
  })
})

describe('catalog', () => {
  it('RF-CATALOGO-10: the form does not offer inactive spaces or categories', async () => {
    const catalog = await getCatalog()
    expect(catalog.buildings.find((b) => b.name === 'Edificio 2')?.spaces).not.toContain('Salón 202')
    expect(catalog.categories.map((c) => c.name)).not.toContain('Jardinería')
  })

  it('RF-CATALOGO-08: names are unique ignoring case, accents and extra spaces', async () => {
    await expect(createBuilding('  biblioteca ')).rejects.toMatchObject({ code: 'DUPLICATE_NAME' })
    await expect(createBuilding('EDIFICIO   2')).rejects.toMatchObject({ code: 'DUPLICATE_NAME' })
  })

  it('RF-CATALOGO-21: a building or category with open reports cannot be deactivated', async () => {
    await expect(setBuildingActive('b-5', false)).rejects.toMatchObject({ code: 'HAS_OPEN_REPORTS' })
    await expect(setCategoryActive('k-1', false)).rejects.toMatchObject({ code: 'HAS_OPEN_REPORTS' })
  })

  it('RF-CATALOGO-15: renaming a space keeps its link', async () => {
    await renameSpace('s-b2', 'Planta alta norte')
    const { buildings } = await getManagedCatalog()
    const space = buildings.flatMap((b) => b.spaces).find((s) => s.id === 's-b2')
    expect(space).toMatchObject({ name: 'Planta alta norte', code: 'F8RD4YK6PB' })
    await renameSpace('s-b2', 'Planta alta')
  })
})

describe('resolveSpaceCode', () => {
  it('RF-REPORTE-05: preselects campus, building and space of an offered space', async () => {
    expect(await resolveSpaceCode('K7P2X9QM4A')).toEqual({
      campus: 'Campus Sauzal',
      building: 'Edificio 5',
      space: 'Salón 204',
      unavailable: false,
    })
  })

  it('RF-REPORTE-10: an inactive space keeps only what is offered', async () => {
    expect(await resolveSpaceCode('B6YP2ZR8MT')).toEqual({
      campus: 'Campus Sauzal',
      building: 'Edificio 2',
      space: undefined,
      unavailable: true,
    })
  })

  it('RF-REPORTE-10: an unknown code preselects nothing', async () => {
    expect(await resolveSpaceCode('ZZZZZZZZZZ')).toMatchObject({ campus: undefined, unavailable: true })
  })
})

describe('roles', () => {
  it('RF-ACCESO-08: only @uabc.edu.mx accounts can get a role', async () => {
    await expect(assignRole('alguien@gmail.com', 'staff')).rejects.toBeInstanceOf(ApiError)
  })

  it('RF-ACCESO-09: an Encargado with open assigned reports keeps the role', async () => {
    await expect(removeRole('carlos.ruiz@uabc.edu.mx')).rejects.toMatchObject({
      code: 'HAS_ASSIGNED_REPORTS',
    })
  })

  it('RF-ACCESO-10: the campus keeps an Admin who has signed in', async () => {
    await expect(removeRole('coordinacion.sauzal@uabc.edu.mx')).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    })
  })
})

describe('thresholds', () => {
  it('RF-MAPA-23, 24: Medio is 2 or more and Alto is above Medio', async () => {
    await expect(setMapThresholds({ medium: 1, high: 4 })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(setMapThresholds({ medium: 4, high: 4 })).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('RF-NOTIFICACION-15: an alert threshold is a whole number from 1', async () => {
    await expect(setAlertThresholds({ new: 0, inReview: null })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
    await setAlertThresholds({ new: 3, inReview: 2 })
    expect((await getThresholds()).alert).toEqual({ new: 3, inReview: 2 })
  })
})
