import { randomUUID } from 'node:crypto'

import { v2 as cloudinary } from 'cloudinary'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { setEventDispatcher } from '../../src/server/db/campus-lock.ts'
import { getDb } from '../../src/server/db/client.ts'
import { categories, reportPhotos, reports } from '../../src/server/db/schema.ts'
import { createPhotoStorage, setPhotoStorage } from '../../src/server/integrations/cloudinary.ts'
import type { DomainEvent } from '../../src/shared/types/events.ts'
import type { Viewer } from '../../src/shared/types/viewer.ts'
import { asViewer } from '../helpers/as-viewer.ts'
import { useTestDb } from '../helpers/db.ts'
import {
  makeBuilding,
  makeCampus,
  makeCategory,
  makeReport,
  makeSpace,
  makeViewer,
} from '../helpers/factories.ts'

const SECRET = 'test-secret'
const storage = createPhotoStorage({
  cloudName: 'cima-fix-test',
  apiKey: 'key',
  apiSecret: SECRET,
  folder: 'cima-fix/test',
})

beforeAll(() => setPhotoStorage(storage))
afterAll(() => setPhotoStorage(undefined))

const events: DomainEvent[] = []
beforeAll(() => setEventDispatcher((batch) => void events.push(...batch)))
afterEach(() => void events.splice(0))
afterAll(() => setEventDispatcher(null))

// What Cloudinary returns after a signed upload to this account.
function uploaded(publicId: string, version = 1700000000) {
  const signature = cloudinary.utils.api_sign_request({ public_id: publicId, version }, SECRET)
  return { publicId, version, signature, format: 'jpg' as const, bytes: 2048 }
}

type Json = Record<string, unknown>

describe('report registration', () => {
  useTestDb()

  async function catalog(options: { severity?: number; thresholdNew?: number } = {}) {
    const campus = await makeCampus({ alertThresholdNew: options.thresholdNew ?? null })
    const building = await makeBuilding({ campusId: campus.id })
    const space = await makeSpace({ buildingId: building.id })
    const category = await makeCategory({ campusId: campus.id, severity: options.severity ?? 2 })
    const selection = {
      campusId: campus.id,
      buildingId: building.id,
      spaceId: space.id,
      categoryId: category.id,
    }
    return { campus, building, space, category, selection }
  }

  function draft(selection: Json, extra: Json = {}) {
    return { ...selection, description: '  Se fue la luz en el salón  ', photoCount: 0, ...extra }
  }

  function submission(selection: Json, extra: Json = {}) {
    return {
      id: randomUUID(),
      ...selection,
      description: '  Se fue la luz en el salón  ',
      photos: [],
      reviewedDuplicateIds: [],
      ...extra,
    }
  }

  describe('POST /api/reports/check', () => {
    it('RF-ACCESO-01: requires a session', async () => {
      const { selection } = await catalog()
      expect((await asViewer(null).post('/api/reports/check', draft(selection))).status).toBe(401)
    })

    it('RF-DUPLICADO-01, 02, 07: lists the open reports of the same campus, category and building, in order', async () => {
      const { selection, campus } = await catalog()
      const viewer = await makeViewer()
      const at = (minutes: number) => new Date(Date.now() - minutes * 60_000)
      const older = await makeReport({ ...selection, createdAt: at(30), priority: 2 })
      const higher = await makeReport({ ...selection, createdAt: at(5), priority: 3 })
      const newer = await makeReport({ ...selection, createdAt: at(10), priority: 2 })
      // Not possible duplicates: closed, or another category, or another building of the campus.
      await makeReport({ ...selection, status: 'cancelled', cancelledAt: new Date() })
      await makeReport({ ...selection, categoryId: (await makeCategory({ campusId: campus.id })).id })
      const otherBuilding = await makeBuilding({ campusId: campus.id })
      await makeReport({
        ...selection,
        buildingId: otherBuilding.id,
        spaceId: (await makeSpace({ buildingId: otherBuilding.id })).id,
      })

      const res = await asViewer(viewer).post('/api/reports/check', draft(selection))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { duplicates: Json[] }
      expect(body.duplicates.map((report) => report.id)).toEqual([higher.id, older.id, newer.id])
      expect(body.duplicates[0]).toMatchObject({ allowedActions: ['confirm'], reportedByMe: false })
    })

    it('RF-DUPLICADO-05: an own report is listed but cannot be confirmed', async () => {
      const { selection } = await catalog()
      const viewer = await makeViewer()
      await makeReport({ ...selection, reporterId: viewer.accountId })
      const res = await asViewer(viewer).post('/api/reports/check', draft(selection))
      const body = (await res.json()) as { duplicates: Json[] }
      expect(body.duplicates[0]).toMatchObject({ reportedByMe: true })
      expect(body.duplicates[0]?.allowedActions).not.toContain('confirm')
    })

    it('RF-REPORTE-12, 13: rejects a selection that is not offered', async () => {
      const { selection, campus, building } = await catalog()
      const otherCampus = await catalog()
      const inactiveSpace = await makeSpace({ buildingId: building.id, isActive: false })
      const inactiveCategory = await makeCategory({ campusId: campus.id, isActive: false })
      const api = asViewer(await makeViewer())
      for (const changed of [
        { spaceId: inactiveSpace.id },
        { categoryId: inactiveCategory.id },
        { categoryId: otherCampus.category.id },
        { spaceId: otherCampus.space.id },
        { buildingId: otherCampus.building.id },
      ]) {
        const res = await api.post('/api/reports/check', draft({ ...selection, ...changed }))
        expect(res.status, JSON.stringify(changed)).toBe(422)
        expect(await res.json()).toMatchObject({ error: { code: 'SELECTION_NOT_OFFERED' } })
      }
    })

    it('RF-REPORTE-01, 02: validates the description', async () => {
      const { selection } = await catalog()
      const api = asViewer(await makeViewer())
      for (const description of ['   ', 'x'.repeat(1001)]) {
        const res = await api.post('/api/reports/check', draft(selection, { description }))
        expect(res.status).toBe(400)
      }
    })

    it('RNF-SEGURIDAD-03: tells the account it reached the limit before it uploads photos', async () => {
      const { selection } = await catalog()
      const viewer = await makeViewer()
      for (let i = 0; i < 10; i++) await makeReport({ reporterId: viewer.accountId })
      const res = await asViewer(viewer).post('/api/reports/check', draft(selection))
      expect(res.status).toBe(429)
      expect(await res.json()).toMatchObject({ error: { code: 'REPORT_LIMIT_REACHED' } })
    })
  })

  describe('POST /api/photos/upload-signature', () => {
    it('RF-REPORTE-03, 09: signs the folder and the allowed formats', async () => {
      const res = await asViewer(await makeViewer()).post('/api/photos/upload-signature', {})
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        folder: 'cima-fix/test',
        allowedFormats: 'jpg,png,webp,heic',
        signature: expect.any(String),
      })
    })

    it('answers 503 when the photo storage is not configured', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubEnv('CLOUDINARY_API_SECRET', '')
      setPhotoStorage(undefined)
      try {
        const res = await asViewer(await makeViewer()).post('/api/photos/upload-signature', {})
        expect(res.status).toBe(503)
        expect(await res.json()).toMatchObject({ error: { code: 'PHOTO_STORAGE_UNAVAILABLE' } })
      } finally {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
        setPhotoStorage(storage)
      }
    })
  })

  describe('POST /api/reports', () => {
    it('RF-REPORTE-01, 07, 08, RF-PRIORIDAD-01: registers a new report with the severity of its category', async () => {
      const { selection } = await catalog({ severity: 3 })
      const viewer = await makeViewer()
      const body = submission(selection)
      const res = await asViewer(viewer).post('/api/reports', body)
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({
        id: body.id,
        status: 'new',
        priority: 'high',
        description: 'Se fue la luz en el salón',
        reportedByMe: true,
        photos: [],
      })
      const [row] = await getDb().select().from(reports).where(eq(reports.id, body.id))
      expect(row).toMatchObject({ reporterId: viewer.accountId, confirmationCount: 0 })
    })

    it('RF-REPORTE-03, 09: keeps up to three verified photos in their order', async () => {
      const { selection } = await catalog()
      const photos = [uploaded('cima-fix/test/a'), uploaded('cima-fix/test/b'), uploaded('cima-fix/test/c')]
      const body = submission(selection, { photos })
      const res = await asViewer(await makeViewer()).post('/api/reports', body)
      expect(res.status).toBe(201)
      const rows = await getDb()
        .select()
        .from(reportPhotos)
        .where(eq(reportPhotos.reportId, body.id))
        .orderBy(reportPhotos.position)
      expect(rows.map((row) => [row.publicId, row.position])).toEqual([
        ['cima-fix/test/a', 1],
        ['cima-fix/test/b', 2],
        ['cima-fix/test/c', 3],
      ])
      expect(((await res.json()) as { photos: Json[] }).photos).toHaveLength(3)
    })

    it('RF-REPORTE-03: rejects a fourth photo', async () => {
      const { selection } = await catalog()
      const photos = ['a', 'b', 'c', 'd'].map((name) => uploaded(`cima-fix/test/${name}`))
      const res = await asViewer(await makeViewer()).post('/api/reports', submission(selection, { photos }))
      expect(res.status).toBe(400)
    })

    it('SDD 10.10: rejects a photo whose signature was not issued for this account', async () => {
      const { selection } = await catalog()
      const forged = { ...uploaded('cima-fix/test/a'), signature: 'f'.repeat(40) }
      const body = submission(selection, { photos: [uploaded('cima-fix/test/b'), forged] })
      const res = await asViewer(await makeViewer()).post('/api/reports', body)
      expect(res.status).toBe(422)
      expect(await res.json()).toMatchObject({ error: { code: 'INVALID_PHOTO', field: 'photos.1' } })
      expect(await getDb().select().from(reports).where(eq(reports.id, body.id))).toEqual([])
    })

    it('RF-REPORTE-06, RF-PRIORIDAD-03: rejects fields the account must not set', async () => {
      const { selection } = await catalog()
      const api = asViewer(await makeViewer())
      for (const extra of [{ priority: 'high' }, { status: 'resolved' }, { reporterId: randomUUID() }]) {
        expect((await api.post('/api/reports', submission(selection, extra))).status).toBe(400)
      }
    })

    it('SDD 6.2: sending the same report twice registers it once', async () => {
      const { selection } = await catalog()
      const api = asViewer(await makeViewer())
      const body = submission(selection)
      expect((await api.post('/api/reports', body)).status).toBe(201)
      const again = await api.post('/api/reports', body)
      expect(again.status).toBe(200)
      expect(await again.json()).toMatchObject({ id: body.id })
      expect(await getDb().select().from(reports).where(eq(reports.id, body.id))).toHaveLength(1)
    })

    it('SDD 6.2: an id that belongs to another account is rejected', async () => {
      const { selection } = await catalog()
      const body = submission(selection)
      await asViewer(await makeViewer()).post('/api/reports', body)
      const res = await asViewer(await makeViewer()).post('/api/reports', body)
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'REPORT_ID_TAKEN' } })
    })

    it('RF-DUPLICADO-04: registers when the account reviewed every possible duplicate', async () => {
      const { selection } = await catalog()
      const existing = await makeReport(selection)
      const res = await asViewer(await makeViewer()).post(
        '/api/reports',
        submission(selection, { reviewedDuplicateIds: [existing.id] }),
      )
      expect(res.status).toBe(201)
    })

    it('SDD 8.2: answers 409 with the list when a possible duplicate appeared after the check', async () => {
      const { selection } = await catalog()
      const reviewed = await makeReport(selection)
      const appeared = await makeReport(selection)
      const body = submission(selection, { reviewedDuplicateIds: [reviewed.id] })
      const res = await asViewer(await makeViewer()).post('/api/reports', body)
      expect(res.status).toBe(409)
      const answer = (await res.json()) as { error: Json; duplicates: Json[] }
      expect(answer.error).toMatchObject({ code: 'NEW_DUPLICATES' })
      expect(answer.duplicates.map((report) => report.id).sort()).toEqual([reviewed.id, appeared.id].sort())
      expect(await getDb().select().from(reports).where(eq(reports.id, body.id))).toEqual([])
    })

    it('RF-REPORTE-13: rejects a selection that stopped being offered', async () => {
      const { selection, category } = await catalog()
      await getDb().update(categories).set({ isActive: false }).where(eq(categories.id, category.id))
      const res = await asViewer(await makeViewer()).post('/api/reports', submission(selection))
      expect(res.status).toBe(422)
    })

    it('RNF-SEGURIDAD-03: the eleventh report within an hour is rejected; older ones do not count', async () => {
      const { selection } = await catalog()
      const viewer: Viewer = await makeViewer()
      await makeReport({ reporterId: viewer.accountId, createdAt: new Date(Date.now() - 61 * 60_000) })
      for (let i = 0; i < 9; i++) await makeReport({ reporterId: viewer.accountId })
      const api = asViewer(viewer)
      expect((await api.post('/api/reports', submission(selection))).status).toBe(201)
      const res = await api.post('/api/reports', submission(selection, { reviewedDuplicateIds: [] }))
      expect(res.status).toBe(429)
    })

    it('RN-07: emits the alert when the report reaches the threshold of new reports, and only then', async () => {
      const { selection, campus } = await catalog({ thresholdNew: 2 })
      const viewer = await makeViewer()
      const api = asViewer(viewer)
      const first = await makeReport({ ...selection, categoryId: (await makeCategory({ campusId: campus.id })).id })

      expect((await api.post('/api/reports', submission(selection))).status).toBe(201)
      expect(events).toEqual([
        { type: 'ThresholdReached', campusId: campus.id, actorId: viewer.accountId, status: 'new', count: 2 },
      ])
      events.splice(0)

      const third = submission(selection, {
        reviewedDuplicateIds: (await getDb().select({ id: reports.id }).from(reports))
          .map((row) => row.id)
          .filter((id) => id !== first.id),
      })
      expect((await api.post('/api/reports', third)).status).toBe(201)
      expect(events).toEqual([])
    })
  })
})
