import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/server/db/client.ts'
import { campuses } from '../../src/server/db/schema.ts'
import { createPhotoStorage, setPhotoStorage } from '../../src/server/integrations/cloudinary.ts'
import { asViewer } from '../helpers/as-viewer.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeBuilding, makeCampus, makeReport, makeSpace, makeViewer } from '../helpers/factories.ts'

beforeAll(() =>
  setPhotoStorage(createPhotoStorage({ cloudName: 'cima-fix-test', apiKey: 'k', apiSecret: 's', folder: 'f' })),
)
afterAll(() => setPhotoStorage(undefined))

describe('campus map', () => {
  useTestDb()

  async function reportsIn(campusId: string, buildingId: string, open: number) {
    const spaceId = (await makeSpace({ buildingId })).id
    for (let i = 0; i < open; i++) await makeReport({ campusId, buildingId, spaceId })
  }

  it('RF-MAPA-01, 05…09: shows the plan and one indicator per positioned building with open reports', async () => {
    const campus = await makeCampus({ name: 'Campus Sauzal', mapThresholdMedium: 2, mapThresholdHigh: 3 })
    const busy = await makeBuilding({ campusId: campus.id, name: 'A', nameKey: 'a', positionX: 10, positionY: 20 })
    const quiet = await makeBuilding({ campusId: campus.id, positionX: 30, positionY: 40 })
    const unplaced = await makeBuilding({ campusId: campus.id })
    await reportsIn(campus.id, busy.id, 3)
    await reportsIn(campus.id, unplaced.id, 1)
    // Closed reports are not counted (RF-MAPA-07, 08).
    await makeReport({ campusId: campus.id, buildingId: quiet.id, status: 'cancelled', cancelledAt: new Date() })

    const res = await asViewer(await makeViewer()).get(`/api/campuses/${campus.id}/map`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      campus: { id: campus.id, name: 'Campus Sauzal' },
      floorPlan: {
        url: `https://res.cloudinary.com/cima-fix-test/image/upload/f_auto,q_auto/v1/${campus.floorPlanPublicId}`,
        width: 2000,
        height: 1200,
      },
      thresholds: { medium: 2, high: 3 },
      legend: [
        { level: 'low', min: 1, max: 1 },
        { level: 'medium', min: 2, max: 2 },
        { level: 'high', min: 3, max: null },
      ],
      indicators: [{ building: { id: busy.id, name: 'A' }, position: { x: 10, y: 20 }, openCount: 3, level: 'high' }],
      noPositionedBuildings: false,
    })
  })

  it('RF-MAPA-11: tells when no building has a position', async () => {
    const campus = await makeCampus()
    await makeBuilding({ campusId: campus.id })
    const res = await asViewer(await makeViewer()).get(`/api/campuses/${campus.id}/map`)
    expect(await res.json()).toMatchObject({ indicators: [], noPositionedBuildings: true, legend: null })
  })

  it('RF-MAPA-04: an inactive or unknown campus has no map', async () => {
    const inactive = await makeCampus({ isActive: false })
    const api = asViewer(await makeViewer())
    for (const id of [inactive.id, '00000000-0000-4000-8000-000000000000']) {
      expect((await api.get(`/api/campuses/${id}/map`)).status).toBe(404)
    }
  })

  it('RF-ACCESO-01: requires a session', async () => {
    const campus = await makeCampus()
    expect((await asViewer(null).get(`/api/campuses/${campus.id}/map`)).status).toBe(401)
  })

  describe('map thresholds', () => {
    const stored = async (id: string) => (await getDb().select().from(campuses).where(eq(campuses.id, id)))[0]

    it('RF-MAPA-22: the admin sets both thresholds and removes them with null', async () => {
      const campus = await makeCampus()
      const api = asViewer(await makeViewer({ campusId: campus.id, role: 'admin' }))
      const path = `/api/campuses/${campus.id}/map-thresholds`

      const set = await api.put(path, { medium: 3, high: 6 })
      expect(set.status).toBe(200)
      expect(await set.json()).toEqual({ medium: 3, high: 6 })
      expect(await stored(campus.id)).toMatchObject({ mapThresholdMedium: 3, mapThresholdHigh: 6 })

      const removed = await api.put(path, null)
      expect(removed.status).toBe(200)
      expect(await removed.json()).toBeNull()
      expect(await stored(campus.id)).toMatchObject({ mapThresholdMedium: null, mapThresholdHigh: null })
    })

    it('RF-MAPA-23, 24: rejects invalid thresholds', async () => {
      const campus = await makeCampus()
      const api = asViewer(await makeViewer({ campusId: campus.id, role: 'admin' }))
      for (const body of [{ medium: 1, high: 5 }, { medium: 4, high: 4 }, { medium: '3', high: 6 }, { medium: 3 }]) {
        expect((await api.put(`/api/campuses/${campus.id}/map-thresholds`, body)).status).toBe(400)
      }
    })

    it('RF-MAPA-21: staff, reporters and admins of another campus cannot set them', async () => {
      const campus = await makeCampus()
      const other = await makeCampus()
      for (const viewer of [
        await makeViewer({ campusId: campus.id, role: 'staff' }),
        await makeViewer(),
        await makeViewer({ campusId: other.id, role: 'admin' }),
      ]) {
        const res = await asViewer(viewer).put(`/api/campuses/${campus.id}/map-thresholds`, { medium: 3, high: 6 })
        expect(res.status).toBe(403)
      }
      expect(await stored(campus.id)).toMatchObject({ mapThresholdMedium: null })
    })
  })
})
