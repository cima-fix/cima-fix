import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/server/db/client.ts'
import { duplicateConfirmations, reports } from '../../src/server/db/schema.ts'
import { createPhotoStorage, setPhotoStorage } from '../../src/server/integrations/cloudinary.ts'
import { asViewer } from '../helpers/as-viewer.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeBuilding, makeCampus, makeCategory, makeReport, makeSpace, makeViewer } from '../helpers/factories.ts'

beforeAll(() =>
  setPhotoStorage(createPhotoStorage({ cloudName: 'c', apiKey: 'k', apiSecret: 's', folder: 'f' })),
)
afterAll(() => setPhotoStorage(undefined))

describe('duplicate confirmations', () => {
  useTestDb()

  async function possibleDuplicate(options: { severity?: number; confirmationCount?: number } = {}) {
    const campus = await makeCampus()
    const category = await makeCategory({ campusId: campus.id, severity: options.severity ?? 1 })
    const report = await makeReport({
      campusId: campus.id,
      categoryId: category.id,
      priority: options.severity ?? 1,
      confirmationCount: options.confirmationCount ?? 0,
    })
    const draft = { campusId: campus.id, categoryId: category.id, buildingId: report.buildingId }
    return { campus, category, report, draft }
  }

  const stored = async (id: string) => (await getDb().select().from(reports).where(eq(reports.id, id)))[0]

  it('RF-DUPLICADO-03: records the confirmation in the report and returns it', async () => {
    const { report, draft } = await possibleDuplicate()
    const viewer = await makeViewer()
    const res = await asViewer(viewer).post(`/api/reports/${report.id}/confirmations`, draft)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: report.id, confirmationCount: 1, confirmedByMe: true })
    const rows = await getDb()
      .select()
      .from(duplicateConfirmations)
      .where(eq(duplicateConfirmations.reportId, report.id))
    expect(rows).toEqual([{ reportId: report.id, accountId: viewer.accountId, createdAt: expect.any(Date) }])
  })

  it('RF-PRIORIDAD-04: the third confirmation raises the priority one level', async () => {
    const { report, draft } = await possibleDuplicate({ severity: 1, confirmationCount: 2 })
    await asViewer(await makeViewer()).post(`/api/reports/${report.id}/confirmations`, draft)
    expect(await stored(report.id)).toMatchObject({ confirmationCount: 3, priority: 2 })
  })

  it('RF-DUPLICADO-05: rejects confirming an own report', async () => {
    const { report, draft } = await possibleDuplicate()
    const author = { accountId: report.reporterId, email: 'x@uabc.edu.mx', roles: new Map() }
    const res = await asViewer(author).post(`/api/reports/${report.id}/confirmations`, draft)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'OWN_REPORT' } })
    expect(await stored(report.id)).toMatchObject({ confirmationCount: 0 })
  })

  it('RF-DUPLICADO-05: rejects a second confirmation of the same account and keeps the count', async () => {
    const { report, draft } = await possibleDuplicate()
    const api = asViewer(await makeViewer())
    expect((await api.post(`/api/reports/${report.id}/confirmations`, draft)).status).toBe(200)
    const again = await api.post(`/api/reports/${report.id}/confirmations`, draft)
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ error: { code: 'ALREADY_CONFIRMED' } })
    expect(await stored(report.id)).toMatchObject({ confirmationCount: 1, priority: 1 })
  })

  it('RF-DUPLICADO-06: rejects a report that is not a possible duplicate of the draft', async () => {
    const { campus, report, draft } = await possibleDuplicate()
    const otherBuilding = await makeBuilding({ campusId: campus.id })
    await makeSpace({ buildingId: otherBuilding.id })
    const otherCategory = await makeCategory({ campusId: campus.id })
    const api = asViewer(await makeViewer())
    for (const changed of [{ buildingId: otherBuilding.id }, { categoryId: otherCategory.id }]) {
      const res = await api.post(`/api/reports/${report.id}/confirmations`, { ...draft, ...changed })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'NOT_CONFIRMABLE' } })
    }
    const other = await makeCampus()
    const res = await api.post(`/api/reports/${report.id}/confirmations`, { ...draft, campusId: other.id })
    expect(res.status).toBe(409)
  })

  it('RF-DUPLICADO-06: rejects a report that was resolved or cancelled', async () => {
    const { report, draft } = await possibleDuplicate()
    await getDb().update(reports).set({ status: 'cancelled', cancelledAt: new Date() }).where(eq(reports.id, report.id))
    const res = await asViewer(await makeViewer()).post(`/api/reports/${report.id}/confirmations`, draft)
    expect(res.status).toBe(409)
    expect(await stored(report.id)).toMatchObject({ confirmationCount: 0 })
  })

  it('answers 404 for a report that does not exist', async () => {
    const { draft } = await possibleDuplicate()
    const res = await asViewer(await makeViewer()).post(
      '/api/reports/00000000-0000-4000-8000-000000000000/confirmations',
      draft,
    )
    expect(res.status).toBe(404)
  })
})
