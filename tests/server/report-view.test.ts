import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { RESOLVED_VISIBILITY_MS } from '../../src/shared/domain/visibility.ts'
import { compareReports } from '../../src/shared/domain/ordering.ts'
import { getDb } from '../../src/server/db/client.ts'
import { duplicateConfirmations, reportPhotos, reports } from '../../src/server/db/schema.ts'
import { createPhotoStorage, setPhotoStorage } from '../../src/server/integrations/cloudinary.ts'
import { getReport, listReports, PAGE_SIZE } from '../../src/server/modules/reports/service.ts'
import { useTestDb } from '../helpers/db.ts'
import {
  makeAccount,
  makeBuilding,
  makeCampus,
  makeCategory,
  makeReport,
  makeSpace,
  makeViewer,
} from '../helpers/factories.ts'

const NOW = new Date('2026-11-24T18:00:00Z')
const photos = createPhotoStorage({
  cloudName: 'cima-fix-test',
  apiKey: 'key',
  apiSecret: 'secret',
  folder: 'cima-fix/test',
})

beforeAll(() => setPhotoStorage(photos))
afterAll(() => setPhotoStorage(undefined))

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms)
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject')
    },
    (error: unknown) => error,
  )
}

describe('report view', () => {
  useTestDb()

  async function campusWithReports() {
    const campus = await makeCampus()
    const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
    const open = await makeReport({ campusId: campus.id })
    const inReview = await makeReport({
      campusId: campus.id,
      status: 'in_review',
      assigneeId: staff.accountId,
    })
    const recentlyResolved = await makeReport({
      campusId: campus.id,
      status: 'resolved',
      assigneeId: staff.accountId,
      resolvedAt: ago(RESOLVED_VISIBILITY_MS - 1),
    })
    const expiredResolved = await makeReport({
      campusId: campus.id,
      status: 'resolved',
      assigneeId: staff.accountId,
      resolvedAt: ago(RESOLVED_VISIBILITY_MS),
    })
    const cancelled = await makeReport({ campusId: campus.id, status: 'cancelled', cancelledAt: NOW })
    return { campus, staff, open, inReview, recentlyResolved, expiredResolved, cancelled }
  }

  async function idsSeenBy(viewer: Awaited<ReturnType<typeof makeViewer>>) {
    const page = await listReports(viewer, { now: NOW })
    return page.reports.map((report) => report.id).sort()
  }

  it('RN-06: a reporter sees open reports and resolved ones within 7 × 24 hours', async () => {
    const data = await campusWithReports()
    const someone = await makeViewer()
    expect(await idsSeenBy(someone)).toEqual(
      [data.open.id, data.inReview.id, data.recentlyResolved.id].sort(),
    )
  })

  it('RN-06: at exactly 7 × 24 hours a resolved report is no longer listed', async () => {
    const data = await campusWithReports()
    const someone = await makeViewer()
    expect(await idsSeenBy(someone)).not.toContain(data.expiredResolved.id)
  })

  it('RF-GESTION-16: staff of the campus see every report, including cancelled and old resolved', async () => {
    const data = await campusWithReports()
    expect(await idsSeenBy(data.staff)).toEqual(
      [data.open, data.inReview, data.recentlyResolved, data.expiredResolved, data.cancelled]
        .map((report) => report.id)
        .sort(),
    )
  })

  it('RN-01: staff of another campus see only what a reporter sees there', async () => {
    const data = await campusWithReports()
    const other = await makeCampus()
    const staffElsewhere = await makeViewer({ campusId: other.id, role: 'staff' })
    expect(await idsSeenBy(staffElsewhere)).toEqual(
      [data.open.id, data.inReview.id, data.recentlyResolved.id].sort(),
    )
  })

  it('applies the conditions of the caller on top of the visibility', async () => {
    const data = await campusWithReports()
    const page = await listReports(data.staff, {
      now: NOW,
      where: eq(reports.status, 'cancelled'),
    })
    expect(page.reports.map((report) => report.id)).toEqual([data.cancelled.id])
  })

  it('RF-GESTION-14: orders open first, then by priority, then oldest', async () => {
    const campus = await makeCampus()
    const staff = await makeViewer({ campusId: campus.id, role: 'admin' })
    const at = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)
    const resolvedHigh = await makeReport({
      campusId: campus.id,
      status: 'resolved',
      assigneeId: staff.accountId,
      priority: 3,
      createdAt: at(100),
      resolvedAt: at(10),
    })
    const openLowOld = await makeReport({ campusId: campus.id, priority: 1, createdAt: at(90) })
    const openHighNew = await makeReport({ campusId: campus.id, priority: 3, createdAt: at(5) })
    const openHighOld = await makeReport({ campusId: campus.id, priority: 3, createdAt: at(50) })

    const page = await listReports(staff, { now: NOW })
    expect(page.reports.map((report) => report.id)).toEqual([
      openHighOld.id,
      openHighNew.id,
      openLowOld.id,
      resolvedHigh.id,
    ])
  })

  it('RNF-RENDIMIENTO-04: pages of 20 that follow the order without gaps or repeats', async () => {
    const campus = await makeCampus()
    const staff = await makeViewer({ campusId: campus.id, role: 'admin' })
    const sameMoment = new Date('2026-11-20T10:00:00.123456Z')
    for (let i = 0; i < PAGE_SIZE + 5; i++) {
      await makeReport({
        campusId: campus.id,
        priority: (i % 3) + 1,
        // Several reports share the exact same moment, so the id has to break the tie.
        createdAt: i % 4 === 0 ? sameMoment : new Date(sameMoment.getTime() + i * 1000),
        ...(i % 5 === 0
          ? { status: 'resolved' as const, assigneeId: staff.accountId, resolvedAt: NOW }
          : {}),
      })
    }

    const first = await listReports(staff, { now: NOW })
    expect(first.reports).toHaveLength(PAGE_SIZE)
    expect(first.nextCursor).not.toBeNull()
    const second = await listReports(staff, { now: NOW, cursor: first.nextCursor ?? undefined })
    expect(second.reports).toHaveLength(5)
    expect(second.nextCursor).toBeNull()

    const listed = [...first.reports, ...second.reports].map((report) => report.id)
    const rows = await getDb().select().from(reports)
    const expected = rows
      .map((row) => ({ ...row, priority: row.priority as 1 | 2 | 3 }))
      .sort(compareReports)
      .map((row) => row.id)
    expect(listed).toEqual(expected)
  })

  it('rejects a cursor that was not produced by the API', async () => {
    const viewer = await makeViewer()
    const error = await rejection(listReports(viewer, { now: NOW, cursor: 'not-a-cursor' }))
    expect(error).toMatchObject({ status: 400, code: 'INVALID_CURSOR' })
  })

  it('RF-GESTION-18: returns the detail of a report the account can see', async () => {
    const data = await campusWithReports()
    const someone = await makeViewer()
    const view = await getReport(someone, data.open.id, { now: NOW })
    expect(view).toMatchObject({ id: data.open.id, status: 'new', priority: 'medium' })
  })

  it('RF-GESTION-19: a cancelled report is unavailable to a reporter, without its data', async () => {
    const data = await campusWithReports()
    const someone = await makeViewer()
    const error = await rejection(getReport(someone, data.cancelled.id, { now: NOW }))
    expect(error).toMatchObject({ status: 404, code: 'REPORT_UNAVAILABLE' })
    expect(JSON.stringify(error)).not.toContain(data.cancelled.description)
  })

  it('RF-GESTION-19: a report that does not exist gets the same answer', async () => {
    const someone = await makeViewer()
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const error = await rejection(getReport(someone, id, { now: NOW }))
      expect(error).toMatchObject({ status: 404, code: 'REPORT_UNAVAILABLE' })
    }
  })

  it('RF-GESTION-20: a resolved report out of the period gets its own notice', async () => {
    const data = await campusWithReports()
    const someone = await makeViewer()
    const error = await rejection(getReport(someone, data.expiredResolved.id, { now: NOW }))
    expect(error).toMatchObject({ status: 404, code: 'REPORT_RESOLVED_EXPIRED' })
  })

  it('RF-GESTION-16: staff of the campus open cancelled and old resolved reports', async () => {
    const data = await campusWithReports()
    for (const report of [data.cancelled, data.expiredResolved]) {
      expect((await getReport(data.staff, report.id, { now: NOW })).id).toBe(report.id)
    }
  })

  it('RN-04: the emails go only to staff and admins of the campus of the report', async () => {
    const data = await campusWithReports()
    const someone = await makeViewer()
    const forStaff = await getReport(data.staff, data.inReview.id, { now: NOW })
    expect(forStaff.reporterEmail).toMatch(/@uabc\.edu\.mx$/)
    expect(forStaff.assigneeEmail).toBe(data.staff.email)
    const forReporter = await getReport(someone, data.inReview.id, { now: NOW })
    expect(forReporter).not.toHaveProperty('reporterEmail')
    expect(forReporter).not.toHaveProperty('assigneeEmail')
  })

  it('SDD 7.3: tells the viewer whether it registered or confirmed the report', async () => {
    const campus = await makeCampus()
    const author = await makeViewer()
    const confirmer = await makeViewer()
    const report = await makeReport({ campusId: campus.id, reporterId: author.accountId })
    await getDb()
      .insert(duplicateConfirmations)
      .values({ reportId: report.id, accountId: confirmer.accountId })

    expect(await getReport(author, report.id, { now: NOW })).toMatchObject({
      reportedByMe: true,
      confirmedByMe: false,
    })
    expect(await getReport(confirmer, report.id, { now: NOW })).toMatchObject({
      reportedByMe: false,
      confirmedByMe: true,
    })
  })

  it('RF-GESTION-02: includes the names of the location and category and the photos in order', async () => {
    const campus = await makeCampus({ name: 'Campus Sauzal' })
    const building = await makeBuilding({ campusId: campus.id, name: 'Edificio 5', nameKey: 'edificio 5' })
    const space = await makeSpace({ buildingId: building.id, name: 'Salón 204', nameKey: 'salon 204' })
    const category = await makeCategory({ campusId: campus.id, name: 'Iluminación', nameKey: 'iluminacion' })
    const reporterAccount = await makeAccount()
    const report = await makeReport({
      campusId: campus.id,
      buildingId: building.id,
      spaceId: space.id,
      categoryId: category.id,
      reporterId: reporterAccount.id,
    })
    await getDb()
      .insert(reportPhotos)
      .values([
        { reportId: report.id, publicId: 'cima-fix/test/second', format: 'jpg', bytes: 10, position: 2 },
        { reportId: report.id, publicId: 'cima-fix/test/first', format: 'png', bytes: 10, position: 1 },
      ])

    const view = await getReport(await makeViewer(), report.id, { now: NOW })
    expect(view).toMatchObject({
      campus: { name: 'Campus Sauzal' },
      building: { name: 'Edificio 5' },
      space: { name: 'Salón 204' },
      category: { name: 'Iluminación' },
    })
    expect(view.photos).toEqual([
      photos.urls({ publicId: 'cima-fix/test/first' }),
      photos.urls({ publicId: 'cima-fix/test/second' }),
    ])
  })
})
