import { LEVELS, type Level } from '../types/common.ts'

// The database stores severity and priority as 1 = low, 2 = medium, 3 = high, so that SQL can
// compute the priority (SDD 6.2, 10.1). The API and the SPA use the names.
export type LevelValue = 1 | 2 | 3

export function toLevelValue(level: Level): LevelValue {
  return (LEVELS.indexOf(level) + 1) as LevelValue
}

export function toLevel(value: number): Level {
  const level = LEVELS[value - 1]
  if (level === undefined) {
    throw new RangeError(`Level value must be 1, 2 or 3; received ${value}.`)
  }
  return level
}
