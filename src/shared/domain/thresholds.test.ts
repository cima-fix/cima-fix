import { describe, expect, it } from 'vitest'

import { crossedThresholds, type ThresholdSnapshot } from './thresholds.ts'

function snapshot(overrides: Partial<ThresholdSnapshot>): ThresholdSnapshot {
  return { newCount: 0, inReviewCount: 0, thresholdNew: null, thresholdInReview: null, ...overrides }
}

describe('crossedThresholds', () => {
  it('RN-07: reached when the count rises to the threshold', () => {
    const before = snapshot({ newCount: 4, thresholdNew: 5 })
    const after = snapshot({ newCount: 5, thresholdNew: 5 })
    expect(crossedThresholds(before, after)).toEqual(['new'])
  })

  it('RN-07: not reached again while the count stays at or above it', () => {
    const before = snapshot({ newCount: 5, thresholdNew: 5 })
    const after = snapshot({ newCount: 6, thresholdNew: 5 })
    expect(crossedThresholds(before, after)).toEqual([])
  })

  it('RN-07: reached again after the count went below and came back', () => {
    const below = snapshot({ newCount: 4, thresholdNew: 5 })
    const back = snapshot({ newCount: 5, thresholdNew: 5 })
    expect(crossedThresholds(snapshot({ newCount: 5, thresholdNew: 5 }), below)).toEqual([])
    expect(crossedThresholds(below, back)).toEqual(['new'])
  })

  it('RN-07: reached when the threshold is lowered to the current count or below', () => {
    const before = snapshot({ inReviewCount: 4, thresholdInReview: 10 })
    const after = snapshot({ inReviewCount: 4, thresholdInReview: 3 })
    expect(crossedThresholds(before, after)).toEqual(['in_review'])
  })

  it('RN-07: reached when a threshold is set while the count is already at or above it', () => {
    const before = snapshot({ newCount: 3, thresholdNew: null })
    const after = snapshot({ newCount: 3, thresholdNew: 3 })
    expect(crossedThresholds(before, after)).toEqual(['new'])
  })

  it('RN-07: a campus without a threshold never reaches it', () => {
    const before = snapshot({ newCount: 0 })
    const after = snapshot({ newCount: 100 })
    expect(crossedThresholds(before, after)).toEqual([])
  })

  it('RN-07: removing a threshold does not reach it', () => {
    const before = snapshot({ newCount: 3, thresholdNew: 3 })
    const after = snapshot({ newCount: 3, thresholdNew: null })
    expect(crossedThresholds(before, after)).toEqual([])
  })

  it('RF-NOTIFICACION-16, 17: setting both thresholds at once can reach both', () => {
    const before = snapshot({ newCount: 3, inReviewCount: 2 })
    const after = snapshot({ newCount: 3, inReviewCount: 2, thresholdNew: 3, thresholdInReview: 2 })
    expect(crossedThresholds(before, after)).toEqual(['new', 'in_review'])
  })

  it('RF-NOTIFICACION-17: an assignment that lowers new and raises in review reaches only in review', () => {
    const before = snapshot({ newCount: 5, inReviewCount: 1, thresholdNew: 5, thresholdInReview: 2 })
    const after = snapshot({ newCount: 4, inReviewCount: 2, thresholdNew: 5, thresholdInReview: 2 })
    expect(crossedThresholds(before, after)).toEqual(['in_review'])
  })
})
