import { describe, expect, it } from 'vitest'
import { MAP_THRESHOLDS, mapLevel } from './demo-api'

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
