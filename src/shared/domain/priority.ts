import type { LevelValue } from './levels'

export const CONFIRMATIONS_PER_LEVEL = 3

const HIGHEST: LevelValue = 3

// RF-PRIORIDAD-02 (SDD 10.1): the severity of the category raised one level for every
// 3 duplicate confirmations, never above high. The API computes the same formula in SQL;
// this version serves the SPA and the tests that keep both in agreement.
export function priority(severity: LevelValue, confirmations: number): LevelValue {
  if (!Number.isInteger(confirmations) || confirmations < 0) {
    throw new RangeError(
      `Confirmations must be a non-negative integer; received ${confirmations}.`,
    )
  }
  const raised = severity + Math.floor(confirmations / CONFIRMATIONS_PER_LEVEL)
  return Math.min(HIGHEST, raised) as LevelValue
}
