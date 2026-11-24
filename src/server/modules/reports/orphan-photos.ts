import { timingSafeEqual } from 'node:crypto'

import { inArray } from 'drizzle-orm'
import { Hono, type Context } from 'hono'

import { getDb } from '../../db/client.ts'
import { reportPhotos } from '../../db/schema.ts'
import { getPhotoStorage } from '../../integrations/cloudinary.ts'
import { AppError } from '../../middleware/errors.ts'
import type { AppEnv } from '../../types.ts'

// Photos uploaded for a registration that failed afterwards (SDD 10.10). It is maintenance, not a
// requirement: if the task does not run, no function is affected.

// Photos younger than this may belong to a registration still in progress.
export const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000

// Most photos the Admin API deletes in one call.
const DELETE_BATCH_SIZE = 100

export async function deleteOrphanPhotos(now: Date): Promise<{ deleted: number }> {
  const storage = getPhotoStorage()
  const cutoff = now.getTime() - ORPHAN_AGE_MS
  let deleted = 0
  let cursor: string | undefined

  do {
    const page = await storage.listUploads(cursor)
    cursor = page.nextCursor
    const old = page.uploads.filter((upload) => upload.createdAt.getTime() < cutoff).map((upload) => upload.publicId)
    if (old.length === 0) continue

    const kept = await getDb()
      .select({ publicId: reportPhotos.publicId })
      .from(reportPhotos)
      .where(inArray(reportPhotos.publicId, old))
    const inUse = new Set(kept.map((row) => row.publicId))
    const orphans = old.filter((publicId) => !inUse.has(publicId))

    for (let start = 0; start < orphans.length; start += DELETE_BATCH_SIZE) {
      const batch = orphans.slice(start, start + DELETE_BATCH_SIZE)
      await storage.deleteUploads(batch)
      deleted += batch.length
    }
  } while (cursor !== undefined)

  return { deleted }
}

// Vercel sends `Authorization: Bearer <CRON_SECRET>`. Without the variable every call is rejected,
// so an empty secret never matches `Bearer ` (SDD 10.10).
function isVercelCron(c: Context<AppEnv>): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(c.req.header('authorization') ?? '')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

// GET /api/cron/orphan-photos. It uses no session.
export const orphanPhotoRoutes = new Hono<AppEnv>().get('/cron/orphan-photos', async (c) => {
  if (!isVercelCron(c)) throw new AppError(401, 'UNAUTHENTICATED', 'No autorizado.')
  return c.json(await deleteOrphanPhotos(new Date()))
})
