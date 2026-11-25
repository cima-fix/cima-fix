import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { setEventDispatcher } from '../../src/server/db/campus-lock.ts'
import { getDb } from '../../src/server/db/client.ts'
import { duplicateConfirmations, reports } from '../../src/server/db/schema.ts'
import { createPhotoStorage, setPhotoStorage } from '../../src/server/integrations/cloudinary.ts'
import { PAGE_SIZE } from '../../src/server/modules/reports/service.ts'
import { RESOLVED_VISIBILITY_MS } from '../../src/shared/domain/visibility.ts'
import type { DomainEvent } from '../../src/shared/types/events.ts'
import type { Viewer } from '../../src/shared/types/viewer.ts'
import { asViewer } from '../helpers/as-viewer.ts'
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

beforeAll(() =>
  setPhotoStorage(createPhotoStorage({ cloudName: 'cima-fix-test', apiKey: 'k', apiSecret: 's', folder: 'f' })),
)
afterAll(() => setPhotoStorage(undefined))

type Page = { reports: { id: string; status: string; assigneeEmail?: string | null }[]; nextCursor: string | null }

const stored = async (id: string) => (await getDb().select().from(reports).where(eq(reports.id, id)))[0]

function captureEvents() {
  const events: DomainEvent[] = []
  setEventDispatcher((batch) => {
    events.push(...batch)
  })
  return events
}

describe('management', () => {
  useTestDb()
  afterEach(() => setEventDispatcher(null))

  // A campus with its staff, an admin and a reporter.
  async function campusTeam(o: Parameters<typeof makeCampus>[0] = {}) {
    const campus = await makeCampus(o)
    return {
      campus,
      staff: await makeViewer({ campusId: campus.id, role: 'staff' }),
      otherStaff: await makeViewer({ campusId: campus.id, role: 'staff' }),
      admin: await makeViewer({ campusId: campus.id, role: 'admin' }),
      reporter: await makeViewer(),
    }
  }

  const assign = (viewer: Viewer, reportId: string, assigneeId: string) =>
    asViewer(viewer).post(`/api/reports/${reportId}/assignment`, { assigneeId })
  const resolve = (viewer: Viewer, reportId: string) => asViewer(viewer).post(`/api/reports/${reportId}/resolution`)
  const cancel = (viewer: Viewer, reportId: string) => asViewer(viewer).post(`/api/reports/${reportId}/cancellation`)

  describe('POST /api/reports/:id/assignment', () => {
    it('RF-GESTION-07, 08: assigns a new report to staff of its campus and moves it to in review', async () => {
      const { campus, staff, admin } = await campusTeam()
      const report = await makeReport({ campusId: campus.id })
      const res = await assign(admin, report.id, staff.accountId)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ id: report.id, status: 'in_review', assigneeEmail: staff.email })
      expect(await stored(report.id)).toMatchObject({ status: 'in_review', assigneeId: staff.accountId })
    })

    it('RF-GESTION-07: staff can assign a report to itself', async () => {
      const { campus, staff } = await campusTeam()
      const report = await makeReport({ campusId: campus.id })
      expect((await assign(staff, report.id, staff.accountId)).status).toBe(200)
      expect(await stored(report.id)).toMatchObject({ assigneeId: staff.accountId })
    })

    it('RF-GESTION-09: reassigns a report in review to other staff without changing its status', async () => {
      const { campus, staff, otherStaff, admin } = await campusTeam()
      const report = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      expect((await assign(admin, report.id, otherStaff.accountId)).status).toBe(200)
      expect(await stored(report.id)).toMatchObject({ status: 'in_review', assigneeId: otherStaff.accountId })
    })

    it('RF-GESTION-06: rejects assigning to an admin, a reporter or staff of another campus', async () => {
      const { campus, staff, admin, reporter } = await campusTeam()
      const otherCampusStaff = await makeViewer({ campusId: (await makeCampus()).id, role: 'staff' })
      const report = await makeReport({ campusId: campus.id })
      for (const assignee of [admin, reporter, otherCampusStaff]) {
        const res = await assign(staff, report.id, assignee.accountId)
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ error: { code: 'ASSIGNEE_NOT_ELIGIBLE', field: 'assigneeId' } })
      }
      expect(await stored(report.id)).toMatchObject({ status: 'new', assigneeId: null })
    })

    it('RF-GESTION-10: a report cannot be left without assignee', async () => {
      const { campus, staff, admin } = await campusTeam()
      const report = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const api = asViewer(admin)
      for (const body of [{ assigneeId: null }, {}]) {
        expect((await api.post(`/api/reports/${report.id}/assignment`, body)).status).toBe(400)
      }
      expect(await stored(report.id)).toMatchObject({ assigneeId: staff.accountId })
    })

    it('rejects reassigning to the account it is already assigned to', async () => {
      const { campus, staff, admin } = await campusTeam()
      const report = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const res = await assign(admin, report.id, staff.accountId)
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'ALREADY_ASSIGNED' } })
    })

    it('RF-GESTION-11: rejects assigning a resolved or cancelled report', async () => {
      const { campus, staff, admin } = await campusTeam()
      const resolved = await makeReport({
        campusId: campus.id,
        status: 'resolved',
        assigneeId: staff.accountId,
        resolvedAt: new Date(),
      })
      const cancelled = await makeReport({ campusId: campus.id, status: 'cancelled', cancelledAt: new Date() })
      for (const report of [resolved, cancelled]) {
        const res = await assign(admin, report.id, staff.accountId)
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } })
      }
    })

    it('RF-GESTION-01: rejects the assignment by a reporter and by staff or admin of another campus', async () => {
      const { campus, staff, reporter } = await campusTeam()
      const other = await makeCampus()
      const report = await makeReport({ campusId: campus.id })
      for (const viewer of [
        reporter,
        await makeViewer({ campusId: other.id, role: 'staff' }),
        await makeViewer({ campusId: other.id, role: 'admin' }),
      ]) {
        const res = await assign(viewer, report.id, staff.accountId)
        expect(res.status).toBe(403)
      }
      expect(await stored(report.id)).toMatchObject({ status: 'new' })
    })

    it('answers 404 for a report that does not exist or that the account cannot see', async () => {
      const { campus, staff } = await campusTeam()
      const cancelled = await makeReport({ campusId: campus.id, status: 'cancelled', cancelledAt: new Date() })
      const reporter = await makeViewer()
      expect((await assign(reporter, cancelled.id, staff.accountId)).status).toBe(404)
      expect((await assign(staff, '00000000-0000-4000-8000-000000000000', staff.accountId)).status).toBe(404)
    })

    it('RF-NOTIFICACION-01: emits ReportAssigned for the account left assigned', async () => {
      const { campus, staff, otherStaff, admin } = await campusTeam()
      const report = await makeReport({ campusId: campus.id })
      const events = captureEvents()
      await assign(admin, report.id, staff.accountId)
      await assign(admin, report.id, otherStaff.accountId)
      expect(events).toEqual([
        { type: 'ReportAssigned', campusId: campus.id, actorId: admin.accountId, reportId: report.id, assigneeId: staff.accountId },
        { type: 'ReportAssigned', campusId: campus.id, actorId: admin.accountId, reportId: report.id, assigneeId: otherStaff.accountId },
      ])
    })

    it('RN-07: assigning a new report can reach the in review threshold', async () => {
      const { campus, staff, admin } = await campusTeam({ alertThresholdInReview: 2 })
      await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const report = await makeReport({ campusId: campus.id })
      const events = captureEvents()
      await assign(admin, report.id, staff.accountId)
      expect(events).toContainEqual({
        type: 'ThresholdReached',
        campusId: campus.id,
        actorId: admin.accountId,
        status: 'in_review',
        count: 2,
      })
    })

    it('RN-07: a reassignment does not reach any threshold', async () => {
      const { campus, staff, otherStaff, admin } = await campusTeam({ alertThresholdInReview: 1 })
      const report = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const events = captureEvents()
      await assign(admin, report.id, otherStaff.accountId)
      expect(events.map((event) => event.type)).toEqual(['ReportAssigned'])
    })

    it('SDD 8.3: of two simultaneous assignments of a new report, only one succeeds', async () => {
      const { campus, staff, otherStaff } = await campusTeam()
      const report = await makeReport({ campusId: campus.id })
      const events = captureEvents()
      const results = await Promise.all([
        assign(staff, report.id, staff.accountId),
        assign(otherStaff, report.id, staff.accountId),
      ])
      expect(results.map((res) => res.status).sort()).toEqual([200, 409])
      expect(events.filter((event) => event.type === 'ReportAssigned')).toHaveLength(1)
    })
  })

  describe('POST /api/reports/:id/resolution', () => {
    it('RF-GESTION-12, 17: the assigned staff resolves a report in review and its time is recorded', async () => {
      const { campus, staff } = await campusTeam()
      const report = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const before = Date.now()
      const res = await resolve(staff, report.id)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { status: string; resolvedAt: string }
      expect(body.status).toBe('resolved')
      const row = await stored(report.id)
      expect(row?.status).toBe('resolved')
      expect(row?.resolvedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000)
      expect(body.resolvedAt).toBe(row?.resolvedAt?.toISOString())
    })

    it('RF-GESTION-01: rejects the resolution by an admin and by a reporter (403)', async () => {
      const { campus, staff, admin, reporter } = await campusTeam()
      const report = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      for (const viewer of [admin, reporter]) {
        expect((await resolve(viewer, report.id)).status).toBe(403)
      }
      expect(await stored(report.id)).toMatchObject({ status: 'in_review' })
    })

    it('RF-GESTION-01: rejects the resolution by staff not assigned and by staff of another campus', async () => {
      const { campus, staff, otherStaff } = await campusTeam()
      const report = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const res = await resolve(otherStaff, report.id)
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'NOT_ASSIGNEE' } })
      const foreign = await makeViewer({ campusId: (await makeCampus()).id, role: 'staff' })
      expect((await resolve(foreign, report.id)).status).toBe(403)
      expect(await stored(report.id)).toMatchObject({ status: 'in_review' })
    })

    it('RF-GESTION-11: rejects resolving a new, resolved or cancelled report', async () => {
      const { campus, staff } = await campusTeam()
      const fresh = await makeReport({ campusId: campus.id })
      const resolved = await makeReport({
        campusId: campus.id,
        status: 'resolved',
        assigneeId: staff.accountId,
        resolvedAt: new Date(),
      })
      const cancelled = await makeReport({
        campusId: campus.id,
        status: 'cancelled',
        assigneeId: staff.accountId,
        cancelledAt: new Date(),
      })
      for (const report of [fresh, resolved, cancelled]) {
        const res = await resolve(staff, report.id)
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } })
      }
      expect(await stored(fresh.id)).toMatchObject({ status: 'new' })
    })

    it('RF-NOTIFICACION-02: emits ReportResolved', async () => {
      const { campus, staff } = await campusTeam()
      const report = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const events = captureEvents()
      await resolve(staff, report.id)
      expect(events).toEqual([{ type: 'ReportResolved', campusId: campus.id, actorId: staff.accountId, reportId: report.id }])
    })
  })

  describe('POST /api/reports/:id/cancellation', () => {
    it('RF-GESTION-13: staff and admins cancel any open report of their campus', async () => {
      const { campus, staff, admin } = await campusTeam()
      const fresh = await makeReport({ campusId: campus.id, confirmationCount: 3 })
      const inReview = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      expect((await cancel(staff, fresh.id)).status).toBe(204)
      expect((await cancel(admin, inReview.id)).status).toBe(204)
      for (const report of [fresh, inReview]) {
        const row = await stored(report.id)
        expect(row?.status).toBe('cancelled')
        expect(row?.cancelledAt).not.toBeNull()
      }
    })

    it('RF-GESTION-13: a reporter cancels its own report without confirmations', async () => {
      const reporter = await makeViewer()
      const report = await makeReport({ reporterId: reporter.accountId })
      expect((await cancel(reporter, report.id)).status).toBe(204)
      expect(await stored(report.id)).toMatchObject({ status: 'cancelled' })
    })

    it('RF-GESTION-01: rejects a reporter cancelling a report of another account or its own with confirmations', async () => {
      const reporter = await makeViewer()
      const foreign = await makeReport()
      const confirmed = await makeReport({ reporterId: reporter.accountId, confirmationCount: 1 })

      const res1 = await cancel(reporter, foreign.id)
      expect(res1.status).toBe(409)
      expect(await res1.json()).toMatchObject({ error: { code: 'NOT_CANCELLABLE' } })
      const res2 = await cancel(reporter, confirmed.id)
      expect(res2.status).toBe(409)
      expect(await res2.json()).toMatchObject({ error: { code: 'HAS_CONFIRMATIONS' } })
      expect(await stored(foreign.id)).toMatchObject({ status: 'new' })
      expect(await stored(confirmed.id)).toMatchObject({ status: 'new' })
    })

    it('RF-GESTION-01: staff or admin of another campus only cancels reports it registered', async () => {
      const { campus } = await campusTeam()
      const foreignAdmin = await makeViewer({ campusId: (await makeCampus()).id, role: 'admin' })
      const foreign = await makeReport({ campusId: campus.id })
      const own = await makeReport({ campusId: campus.id, reporterId: foreignAdmin.accountId })
      expect((await cancel(foreignAdmin, foreign.id)).status).toBe(409)
      expect((await cancel(foreignAdmin, own.id)).status).toBe(204)
    })

    it('RF-GESTION-11: rejects cancelling a resolved or cancelled report', async () => {
      const { campus, staff } = await campusTeam()
      const resolved = await makeReport({
        campusId: campus.id,
        status: 'resolved',
        assigneeId: staff.accountId,
        resolvedAt: new Date(),
      })
      const cancelled = await makeReport({ campusId: campus.id, status: 'cancelled', cancelledAt: new Date() })
      for (const report of [resolved, cancelled]) {
        const res = await cancel(staff, report.id)
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ error: { code: 'INVALID_TRANSITION' } })
      }
      expect(await stored(resolved.id)).toMatchObject({ status: 'resolved' })
    })

    it('RF-NOTIFICACION-03: emits ReportCancelled', async () => {
      const { campus, staff } = await campusTeam()
      const report = await makeReport({ campusId: campus.id })
      const events = captureEvents()
      await cancel(staff, report.id)
      expect(events).toEqual([{ type: 'ReportCancelled', campusId: campus.id, actorId: staff.accountId, reportId: report.id }])
    })

    it('emits nothing when the action is rejected', async () => {
      const reporter = await makeViewer()
      const report = await makeReport()
      const events = captureEvents()
      await cancel(reporter, report.id)
      expect(events).toEqual([])
    })

    it('SDD 10.3: cancelling while another account confirms it, only one of both succeeds', async () => {
      const reporter = await makeViewer()
      const report = await makeReport({ reporterId: reporter.accountId })
      const confirmer = await makeViewer()
      const draft = { campusId: report.campusId, categoryId: report.categoryId, buildingId: report.buildingId }

      const [cancelled, confirmed] = await Promise.all([
        cancel(reporter, report.id),
        asViewer(confirmer).post(`/api/reports/${report.id}/confirmations`, draft),
      ])
      const row = await stored(report.id)
      if (cancelled.status === 204) {
        expect(confirmed.status).toBe(409)
        expect(row).toMatchObject({ status: 'cancelled', confirmationCount: 0 })
      } else {
        expect(cancelled.status).toBe(409)
        expect(confirmed.status).toBe(200)
        expect(row).toMatchObject({ status: 'new', confirmationCount: 1 })
      }
    })
  })

  describe('RN-07 on every action', () => {
    it('no action that lowers a count reaches a threshold', async () => {
      const { campus, staff, admin } = await campusTeam({ alertThresholdNew: 1, alertThresholdInReview: 1 })
      const fresh = await makeReport({ campusId: campus.id })
      const second = await makeReport({ campusId: campus.id })
      const inReview = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const events = captureEvents()
      await cancel(admin, fresh.id)
      await resolve(staff, inReview.id)
      // The new count goes from 2 to 1 and the in review count from 1 to 0 and back to 1.
      await assign(admin, second.id, staff.accountId)
      expect(events.filter((event) => event.type === 'ThresholdReached')).toEqual([
        { type: 'ThresholdReached', campusId: campus.id, actorId: admin.accountId, status: 'in_review', count: 1 },
      ])
    })
  })

  describe('GET /api/reports', () => {
    async function list(viewer: Viewer, query = '') {
      const res = await asViewer(viewer).get(`/api/reports${query}`)
      expect(res.status).toBe(200)
      return (await res.json()) as Page
    }
    const ids = (page: Page) => page.reports.map((report) => report.id).sort()

    it('RF-GESTION-03: combines the filters by campus, category, building and status', async () => {
      const campus = await makeCampus()
      const category = await makeCategory({ campusId: campus.id })
      const building = await makeBuilding({ campusId: campus.id })
      const spaceId = (await makeSpace({ buildingId: building.id })).id
      const match = await makeReport({ campusId: campus.id, categoryId: category.id, buildingId: building.id, spaceId })
      await makeReport({ campusId: campus.id, buildingId: building.id, spaceId }) // other category
      await makeReport({ campusId: campus.id, categoryId: category.id }) // other building
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      await makeReport({
        campusId: campus.id,
        categoryId: category.id,
        buildingId: building.id,
        spaceId,
        status: 'in_review',
        assigneeId: staff.accountId,
      }) // other status
      await makeReport() // other campus

      const viewer = await makeViewer()
      expect(ids(await list(viewer, `?campusId=${campus.id}&categoryId=${category.id}&buildingId=${building.id}&status=new`))).toEqual([match.id])
      expect((await list(viewer, `?campusId=${campus.id}`)).reports).toHaveLength(4)
      expect((await list(viewer, '?status=new')).reports).toHaveLength(4)
    })

    it('RF-GESTION-04: rejects the category or building filter without a campus', async () => {
      const viewer = await makeViewer()
      const category = await makeCategory({ campusId: (await makeCampus()).id })
      const res = await asViewer(viewer).get(`/api/reports?categoryId=${category.id}`)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { field: 'campusId' } })
    })

    it('rejects an unknown filter or an invalid status', async () => {
      const api = asViewer(await makeViewer())
      expect((await api.get('/api/reports?priority=high')).status).toBe(400)
      expect((await api.get('/api/reports?status=open')).status).toBe(400)
    })

    it('RF-GESTION-15: "mine" shows the reports registered or confirmed by the account', async () => {
      const viewer = await makeViewer()
      const registered = await makeReport({ reporterId: viewer.accountId })
      const confirmed = await makeReport({ confirmationCount: 1 })
      await getDb().insert(duplicateConfirmations).values({ reportId: confirmed.id, accountId: viewer.accountId })
      const other = await makeReport()
      expect(ids(await list(viewer, '?mine=1'))).toEqual([registered.id, confirmed.id].sort())
      // Combined with RF-GESTION-03.
      expect(ids(await list(viewer, `?mine=1&campusId=${registered.campusId}`))).toEqual([registered.id])
      expect(ids(await list(viewer))).toContain(other.id)
    })

    it('RF-GESTION-22: "assignedToMe" shows only the reports assigned to the account', async () => {
      const { campus, staff, otherStaff } = await campusTeam()
      const mine = await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: otherStaff.accountId })
      await makeReport({ campusId: campus.id })
      expect(ids(await list(staff, '?assignedToMe=1'))).toEqual([mine.id])
      expect(ids(await list(staff, '?assignedToMe=1&status=new'))).toEqual([])
    })

    it('RF-GESTION-16: the status filter does not show what the account cannot see', async () => {
      const { campus, staff } = await campusTeam()
      const reporter = await makeViewer()
      await makeReport({ campusId: campus.id, reporterId: reporter.accountId, status: 'cancelled', cancelledAt: new Date() })
      await makeReport({
        campusId: campus.id,
        reporterId: reporter.accountId,
        status: 'resolved',
        assigneeId: staff.accountId,
        resolvedAt: new Date(Date.now() - RESOLVED_VISIBILITY_MS - 1000),
      })
      expect((await list(reporter, '?status=cancelled')).reports).toHaveLength(0)
      expect((await list(reporter, '?status=resolved&mine=1')).reports).toHaveLength(0)
      expect((await list(staff, '?status=cancelled')).reports).toHaveLength(1)
      expect((await list(staff, '?status=resolved')).reports).toHaveLength(1)
    })

    it('RF-GESTION-05: the emails are sent only to staff and admins of the campus of the report', async () => {
      const { campus, staff } = await campusTeam()
      await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const foreignStaff = await makeViewer({ campusId: (await makeCampus()).id, role: 'staff' })
      expect((await list(staff)).reports[0]).toHaveProperty('assigneeEmail', staff.email)
      for (const viewer of [await makeViewer(), foreignStaff]) {
        expect((await list(viewer)).reports[0]).not.toHaveProperty('assigneeEmail')
        expect((await list(viewer)).reports[0]).not.toHaveProperty('reporterEmail')
      }
    })

    it('RF-GESTION-14, 23: pages through every registered report in order with the cursor', async () => {
      const campus = await makeCampus()
      for (let i = 0; i < PAGE_SIZE + 2; i++) await makeReport({ campusId: campus.id, priority: (i % 3) + 1 })
      const viewer = await makeViewer()
      const first = await list(viewer, `?campusId=${campus.id}`)
      expect(first.reports).toHaveLength(PAGE_SIZE)
      expect(first.nextCursor).not.toBeNull()
      const second = await list(viewer, `?campusId=${campus.id}&cursor=${first.nextCursor}`)
      expect(second.reports).toHaveLength(2)
      expect(second.nextCursor).toBeNull()
      const all = [...first.reports, ...second.reports].map((report) => report.id)
      expect(new Set(all).size).toBe(PAGE_SIZE + 2)
    })

    it('rejects an invalid cursor', async () => {
      const res = await asViewer(await makeViewer()).get('/api/reports?cursor=nope')
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'INVALID_CURSOR' } })
    })
  })

  describe('GET /api/reports/:id', () => {
    it('RF-GESTION-02, 18: shows the report through its own link', async () => {
      const report = await makeReport({ description: 'Gotera en el techo' })
      const res = await asViewer(await makeViewer()).get(`/api/reports/${report.id}`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ id: report.id, description: 'Gotera en el techo', status: 'new' })
    })

    it('RF-GESTION-19: a cancelled report opened by a reporter, or a link of no report, is unavailable', async () => {
      const cancelled = await makeReport({ status: 'cancelled', cancelledAt: new Date() })
      const api = asViewer(await makeViewer())
      for (const id of [cancelled.id, '00000000-0000-4000-8000-000000000000', 'not-a-report']) {
        const res = await api.get(`/api/reports/${id}`)
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: { code: 'REPORT_UNAVAILABLE', message: 'El reporte no está disponible.' } })
      }
    })

    it('RF-GESTION-20: a resolved report past the period has its own notice and no data', async () => {
      const staff = await makeAccount()
      const report = await makeReport({
        status: 'resolved',
        assigneeId: staff.id,
        resolvedAt: new Date(Date.now() - RESOLVED_VISIBILITY_MS - 1000),
      })
      const res = await asViewer(await makeViewer()).get(`/api/reports/${report.id}`)
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('REPORT_RESOLVED_EXPIRED')
      expect(JSON.stringify(body)).not.toContain(report.id)
    })
  })

  describe('GET /api/campuses/:id/buildings/:bid/open-reports', () => {
    it('RF-MAPA-16…18: lists the open reports of the building in the order of the query', async () => {
      const { campus, staff } = await campusTeam()
      const building = await makeBuilding({ campusId: campus.id })
      const spaceId = (await makeSpace({ buildingId: building.id })).id
      const at = { campusId: campus.id, buildingId: building.id, spaceId }
      const low = await makeReport({ ...at, priority: 1 })
      const high = await makeReport({ ...at, priority: 3 })
      const inReview = await makeReport({ ...at, priority: 2, status: 'in_review', assigneeId: staff.accountId })
      await makeReport({ ...at, status: 'resolved', assigneeId: staff.accountId, resolvedAt: new Date() })
      await makeReport({ ...at, status: 'cancelled', cancelledAt: new Date() })
      await makeReport({ campusId: campus.id }) // another building

      const res = await asViewer(await makeViewer()).get(`/api/campuses/${campus.id}/buildings/${building.id}/open-reports`)
      expect(res.status).toBe(200)
      const page = (await res.json()) as Page
      expect(page.reports.map((report) => report.id)).toEqual([high.id, inReview.id, low.id])
      // RF-MAPA-17: the same view as the report query.
      expect(Object.keys(page.reports[0] ?? {}).sort()).toEqual(
        Object.keys(((await (await asViewer(await makeViewer()).get(`/api/reports/${high.id}`)).json()) as object)).sort(),
      )
    })

    it('answers 404 for a building of another campus or of an inactive campus', async () => {
      const campus = await makeCampus()
      const foreign = await makeBuilding({ campusId: (await makeCampus()).id })
      const inactive = await makeCampus({ isActive: false })
      const hidden = await makeBuilding({ campusId: inactive.id })
      const api = asViewer(await makeViewer())
      expect((await api.get(`/api/campuses/${campus.id}/buildings/${foreign.id}/open-reports`)).status).toBe(404)
      expect((await api.get(`/api/campuses/${inactive.id}/buildings/${hidden.id}/open-reports`)).status).toBe(404)
    })
  })

  it('RF-PRIORIDAD-06: no action changes the priority', async () => {
    const { campus, staff } = await campusTeam()
    const report = await makeReport({ campusId: campus.id, priority: 3 })
    await assign(staff, report.id, staff.accountId)
    await resolve(staff, report.id)
    expect(await stored(report.id)).toMatchObject({ priority: 3 })
  })
})