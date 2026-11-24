import { describe, expect, it } from 'vitest'

import { buildingLevel, mapLegend } from './map-levels.ts'

const THRESHOLDS = { medium: 3, high: 6 }

describe('buildingLevel', () => {
  it.each([
    [1, 'low'],
    [2, 'low'],
    [3, 'medium'],
    [5, 'medium'],
    [6, 'high'],
    [40, 'high'],
  ] as const)('RN-08: %i open reports with thresholds 3 and 6 is %s', (openCount, expected) => {
    expect(buildingLevel(openCount, THRESHOLDS)).toBe(expected)
  })

  it('RN-08: without map thresholds the indicator has no level', () => {
    expect(buildingLevel(10, null)).toBeNull()
  })
})

describe('mapLegend', () => {
  it('RF-MAPA-10: with medium 3 and high 6 the legend is low 1–2, medium 3–5, high 6 or more', () => {
    expect(mapLegend(THRESHOLDS)).toEqual([
      { level: 'low', min: 1, max: 2 },
      { level: 'medium', min: 3, max: 5 },
      { level: 'high', min: 6, max: null },
    ])
  })

  it('RF-MAPA-10: without map thresholds there is no legend', () => {
    expect(mapLegend(null)).toBeNull()
  })

  it('agrees with buildingLevel at every boundary', () => {
    const thresholds = { medium: 2, high: 3 }
    for (const entry of mapLegend(thresholds) ?? []) {
      expect(buildingLevel(entry.min, thresholds)).toBe(entry.level)
      if (entry.max !== null) expect(buildingLevel(entry.max, thresholds)).toBe(entry.level)
    }
  })
})
