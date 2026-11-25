import { describe, expect, it } from 'vitest'
import {
  ApiError,
  assignRole,
  createBuilding,
  getManagedCatalog,
  getThresholds,
  removeRole,
  renameSpace,
  setAlertThresholds,
  setBuildingActive,
  setCategoryActive,
  setMapThresholds,
} from './demo-api'

// The demo data still behind the catalog, staff and settings screens (#68).

describe('catalog', () => {
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
