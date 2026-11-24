import { describe, expect, it } from 'vitest'

import { createPhotoStorage } from '../../integrations/cloudinary'
import { toMapView, type CampusMapRecord } from './view'

const photos = createPhotoStorage({
  cloudName: 'cima-fix-test',
  apiKey: 'key',
  apiSecret: 'secret',
  folder: 'cima-fix/local',
})

type Building = CampusMapRecord['buildings'][number]

function building(id: string, overrides: Partial<Building> = {}): Building {
  return { id, name: `Edificio ${id}`, isActive: true, position: { x: 10, y: 20 }, openCount: 1, ...overrides }
}

function campusWith(buildings: Building[], thresholds: CampusMapRecord['thresholds'] = null): CampusMapRecord {
  return {
    campus: { id: 'campus', name: 'Campus Sauzal' },
    floorPlan: { publicId: 'cima-fix/plans/sauzal', width: 2000, height: 1500 },
    thresholds,
    buildings,
  }
}

function indicatorIds(record: CampusMapRecord): string[] {
  return toMapView(record, photos).indicators.map((indicator) => indicator.building.id)
}

describe('toMapView', () => {
  it('RF-MAPA-01: includes the plan of the campus with its size', () => {
    expect(toMapView(campusWith([]), photos).floorPlan).toEqual({
      url: photos.floorPlanUrl('cima-fix/plans/sauzal'),
      width: 2000,
      height: 1500,
    })
  })

  it('RF-MAPA-05: shows an active building with a position and open reports, at its position', () => {
    const view = toMapView(campusWith([building('a', { position: { x: 120, y: 340 } })]), photos)
    expect(view.indicators).toEqual([
      { building: { id: 'a', name: 'Edificio a' }, position: { x: 120, y: 340 }, openCount: 1, level: null },
    ])
  })

  it('RF-MAPA-05: leaves out a deactivated building', () => {
    expect(indicatorIds(campusWith([building('a', { isActive: false })]))).toEqual([])
  })

  it('RF-MAPA-06: leaves out a building without a position, even with open reports', () => {
    expect(indicatorIds(campusWith([building('a', { position: null, openCount: 5 })]))).toEqual([])
  })

  it('RF-MAPA-07: leaves out a building without open reports', () => {
    expect(indicatorIds(campusWith([building('a', { openCount: 0 })]))).toEqual([])
  })

  it('RF-MAPA-08: the indicator shows the number of open reports', () => {
    expect(toMapView(campusWith([building('a', { openCount: 7 })]), photos).indicators[0]?.openCount).toBe(7)
  })

  it('RF-MAPA-09, RN-08: with thresholds each indicator has its level', () => {
    const record = campusWith(
      [building('a', { openCount: 2 }), building('b', { openCount: 3 }), building('c', { openCount: 6 })],
      { medium: 3, high: 6 },
    )
    expect(toMapView(record, photos).indicators.map((indicator) => indicator.level)).toEqual([
      'low',
      'medium',
      'high',
    ])
  })

  it('RF-MAPA-10: includes the legend only when the campus has map thresholds', () => {
    expect(toMapView(campusWith([], { medium: 3, high: 6 }), photos).legend).toEqual([
      { level: 'low', min: 1, max: 2 },
      { level: 'medium', min: 3, max: 5 },
      { level: 'high', min: 6, max: null },
    ])
    expect(toMapView(campusWith([]), photos).legend).toBeNull()
  })

  it('RF-MAPA-11: warns when no building of the campus has a position', () => {
    expect(toMapView(campusWith([building('a', { position: null })]), photos).noPositionedBuildings).toBe(true)
    expect(toMapView(campusWith([]), photos).noPositionedBuildings).toBe(true)
  })

  it('RF-MAPA-11: does not warn when some building has a position, even without open reports', () => {
    const record = campusWith([building('a', { position: null }), building('b', { openCount: 0 })])
    expect(toMapView(record, photos).noPositionedBuildings).toBe(false)
  })
})
