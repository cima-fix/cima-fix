import { eq, sql } from 'drizzle-orm'

import type { ThresholdSnapshot } from '../../shared/domain/thresholds.ts'
import type { Executor } from './client.ts'
import { campuses, reports } from './schema.ts'

// RN-07 (SDD 9.2): counts and alert thresholds of a campus, read inside the transaction that
// holds the campus lock (DD-08). Shared by every operation that checks the thresholds.
export async function thresholdSnapshot(db: Executor, campusId: string): Promise<ThresholdSnapshot> {
  const [row] = await db
    .select({
      newCount: sql<number>`count(${reports.id}) filter (where ${reports.status} = 'new')::int`,
      inReviewCount: sql<number>`count(${reports.id}) filter (where ${reports.status} = 'in_review')::int`,
      thresholdNew: campuses.alertThresholdNew,
      thresholdInReview: campuses.alertThresholdInReview,
    })
    .from(campuses)
    .leftJoin(reports, eq(reports.campusId, campuses.id))
    .where(eq(campuses.id, campusId))
    .groupBy(campuses.id)
  if (!row) throw new Error('Campus not found for the threshold snapshot')
  return row
}