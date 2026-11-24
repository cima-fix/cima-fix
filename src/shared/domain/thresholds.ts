import type { OpenStatus } from '../types/common'

// Counts and alert thresholds of a campus at one moment, read inside the transaction that holds
// the campus lock (SDD 9.2, DD-08). A null threshold means none is set.
export type ThresholdSnapshot = {
  newCount: number
  inReviewCount: number
  thresholdNew: number | null
  thresholdInReview: number | null
}

function isReached(count: number, threshold: number | null): boolean {
  return threshold !== null && count >= threshold
}

// RN-07: a threshold is reached when the campus goes from not being at or above it (or from
// having no threshold) to being at or above it, whether the count or the threshold changed.
// Staying at or above it does not reach it again. Returns the statuses whose threshold the
// operation reached, which are the alerts to send (RF-NOTIFICACION-16, 17).
export function crossedThresholds(
  before: ThresholdSnapshot,
  after: ThresholdSnapshot,
): OpenStatus[] {
  const crossed: OpenStatus[] = []
  if (
    !isReached(before.newCount, before.thresholdNew) &&
    isReached(after.newCount, after.thresholdNew)
  ) {
    crossed.push('new')
  }
  if (
    !isReached(before.inReviewCount, before.thresholdInReview) &&
    isReached(after.inReviewCount, after.thresholdInReview)
  ) {
    crossed.push('in_review')
  }
  return crossed
}
