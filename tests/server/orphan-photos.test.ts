import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDb } from '../../src/server/db/client.ts'
import { reportPhotos } from '../../src/server/db/schema.ts'
import {
  createPhotoStorage,
  setPhotoStorage,
  type PhotoStorage,
  type UploadPage,
} from '../../src/server/integrations/cloudinary.ts'
import { deleteOrphanPhotos, ORPHAN_AGE_MS } from '../../src/server/modules/reports/orphan-photos.ts'
import { asViewer } from '../helpers/as-viewer.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeCampus, makeReport } from '../helpers/factories.ts'

const NOW = new Date('2026-11-24T10:00:00Z')
const old = new Date(NOW.getTime() - ORPHAN_AGE_MS - 1)
const recent = new Date(NOW.getTime() - ORPHAN_AGE_MS + 60_000)

// A Cloudinary folder held in memory, listed in pages of `pageSize`.
function fakeStorage(uploads: { publicId: string; createdAt: Date }[], pageSize = 500) {
  const deleted: string[][] = []
  const real = createPhotoStorage({ cloudName: 'c', apiKey: 'k', apiSecret: 's', folder: 'f' })
  const storage: PhotoStorage = {
    ...real,
    async listUploads(cursor) {
      const start = cursor === undefined ? 0 : Number(cursor)
      const page: UploadPage = {
        uploads: uploads.slice(start, start + pageSize),
        nextCursor: start + pageSize < uploads.length ? String(start + pageSize) : undefined,
      }
      return page
    },
    async deleteUploads(publicIds) {
      deleted.push(publicIds)
    },
  }
  setPhotoStorage(storage)
  return deleted
}

afterEach(() => {
  setPhotoStorage(undefined)
  vi.unstubAllEnvs()
})

describe('orphan photos', () => {
  useTestDb()

  async function photoInReport(publicId: string) {
    const report = await makeReport()
    await getDb().insert(reportPhotos).values({ reportId: report.id, publicId, format: 'jpg', bytes: 1, position: 1 })
  }

  it('deletes only photos older than 24 hours that are in no report', async () => {
    await photoInReport('f/kept')
    const deleted = fakeStorage([
      { publicId: 'f/kept', createdAt: old },
      { publicId: 'f/orphan', createdAt: old },
      { publicId: 'f/uploading', createdAt: recent },
    ])
    expect(await deleteOrphanPhotos(NOW)).toEqual({ deleted: 1 })
    expect(deleted).toEqual([['f/orphan']])
  })

  it('never deletes the plan of a campus, even in the same folder', async () => {
    const campus = await makeCampus({ floorPlanPublicId: 'f/plan' })
    const deleted = fakeStorage([
      { publicId: campus.floorPlanPublicId, createdAt: old },
      { publicId: 'f/orphan', createdAt: old },
    ])
    expect(await deleteOrphanPhotos(NOW)).toEqual({ deleted: 1 })
    expect(deleted).toEqual([['f/orphan']])
  })

  it('goes through every page and deletes in batches of 100', async () => {
    const uploads = Array.from({ length: 250 }, (_, i) => ({ publicId: `f/${i}`, createdAt: old }))
    const deleted = fakeStorage(uploads, 120)
    expect(await deleteOrphanPhotos(NOW)).toEqual({ deleted: 250 })
    expect(deleted.map((batch) => batch.length)).toEqual([100, 20, 100, 20, 10])
    expect(deleted.flat()).toEqual(uploads.map((upload) => upload.publicId))
  })

  describe('GET /api/cron/orphan-photos', () => {
    const call = (authorization?: string) =>
      asViewer(null).app.request('/api/cron/orphan-photos', {
        headers: authorization === undefined ? {} : { authorization },
      })

    it('runs with the secret that Vercel sends, without a session', async () => {
      vi.stubEnv('CRON_SECRET', 'a-long-secret')
      fakeStorage([])
      const res = await call('Bearer a-long-secret')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ deleted: 0 })
    })

    it('answers 401 without the exact secret', async () => {
      vi.stubEnv('CRON_SECRET', 'a-long-secret')
      const deleted = fakeStorage([{ publicId: 'f/orphan', createdAt: old }])
      for (const header of [undefined, 'Bearer wrong', 'a-long-secret', 'Bearer a-long-secret-2', 'bearer a-long-secret']) {
        expect((await call(header)).status, String(header)).toBe(401)
      }
      expect(deleted).toEqual([])
    })

    it('answers 401 when the secret is not set, even to an empty bearer', async () => {
      vi.stubEnv('CRON_SECRET', '')
      fakeStorage([])
      expect((await call('Bearer ')).status).toBe(401)
      expect((await call('Bearer undefined')).status).toBe(401)
    })
  })
})
