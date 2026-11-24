import type { Level } from '../types/common.ts'

export type MapThresholds = { medium: number; high: number }

// RN-08 (SDD 10.6). Without map thresholds the indicator has no level (RF-MAPA-09).
export function buildingLevel(openCount: number, thresholds: MapThresholds | null): Level | null {
  if (thresholds === null) return null
  if (openCount >= thresholds.high) return 'high'
  if (openCount >= thresholds.medium) return 'medium'
  return 'low'
}

// Range of open reports of each level; `max: null` means "or more".
export type LegendEntry = { level: Level; min: number; max: number | null }

// RF-MAPA-10: with medium 3 and high 6, the legend is low 1–2, medium 3–5 and high 6 or more.
// Low starts at 1 because a building without open reports has no indicator (RF-MAPA-07).
export function mapLegend(thresholds: MapThresholds | null): LegendEntry[] | null {
  if (thresholds === null) return null
  return [
    { level: 'low', min: 1, max: thresholds.medium - 1 },
    { level: 'medium', min: thresholds.medium, max: thresholds.high - 1 },
    { level: 'high', min: thresholds.high, max: null },
  ]
}
