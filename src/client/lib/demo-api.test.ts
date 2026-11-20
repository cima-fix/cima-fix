import { describe, expect, it } from 'vitest'
import {
  confirmReport,
  findSimilarReports,
  getCampusMap,
  listReports,
  MAP_THRESHOLDS,
  mapLevel,
} from './demo-api'
import { isOpen } from './reports'

describe('mapLevel', () => {
  // RN-08 with the RF-MAPA-10 example thresholds: Medio from 3, Alto from 6.
  it('uses the RF-MAPA-10 example thresholds', () => {
    expect(MAP_THRESHOLDS).toEqual({ medium: 3, high: 6 })
  })

  it.each([
    [1, 'low'],
    [2, 'low'],
    [3, 'medium'],
    [5, 'medium'],
    [6, 'high'],
    [12, 'high'],
  ] as const)('RN-08: %i open reports is level %s', (openReports, level) => {
    expect(mapLevel(openReports)).toBe(level)
  })
})

describe('getCampusMap', () => {
  it('RF-MAPA-08: each count equals the open reports of the building', async () => {
    const [buildings, reports] = await Promise.all([getCampusMap(), listReports()])
    for (const building of buildings) {
      const open = reports.filter((r) => r.building === building.name && isOpen(r)).length
      expect(building.openReports, building.name).toBe(open)
    }
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
