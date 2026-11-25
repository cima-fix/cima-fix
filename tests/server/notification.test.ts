import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { setEventDispatcher } from '../../src/server/db/campus-lock.ts'
import { getDb } from '../../src/server/db/client.ts'
import { accounts, campuses, duplicateConfirmations, reports } from '../../src/server/db/schema.ts'
import { createPhotoStorage, setPhotoStorage } from '../../src/server/integrations/cloudinary.ts'
import { ExternalServiceUnavailable } from '../../src/server/integrations/errors.ts'
import { setMailer, type Email } from '../../src/server/integrations/mailer.ts'
import { deliver, startNotifications } from '../../src/server/modules/notifications/service.ts'
import type { Viewer } from '../../src/shared/types/viewer.ts'
import { asViewer } from '../helpers/as-viewer.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeBuilding, makeCampus, makeCategory, makeReport, makeSpace, makeViewer } from '../helpers/factories.ts'

const BASE_URL = 'https://cimafix.test'
let previousBaseUrl: string | undefined

beforeAll(() => {
  previousBaseUrl = process.env.APP_BASE_URL
  process.env.APP_BASE_URL = BASE_URL
  setPhotoStorage(createPhotoStorage({ cloudName: 'c', apiKey: 'k', apiSecret: 's', folder: 'f' }))
})
afterAll(() => {
  if (previousBaseUrl === undefined) delete process.env.APP_BASE_URL
  else process.env.APP_BASE_URL = previousBaseUrl
  setPhotoStorage(undefined)
})

// Fake Resend (SDD 16): records what it is asked to send, and can be down.
function useFakeMailer() {
  const sent: Email[] = []
  const state = { down: false, calls: 0 }
  setMailer({
    async send(emails) {
      state.calls++
      if (state.down) throw new ExternalServiceUnavailable('resend')
      sent.push(...emails)
    },
  })
  return { sent, state }
}

const recipients = (sent: Email[]) => sent.map((email) => email.to).sort()

describe('notifications', () => {
  useTestDb()
  let mail: ReturnType<typeof useFakeMailer>

  // The tests wait for the emails: `deliver` is awaited after the COMMIT, without waitUntil.
  beforeEach(() => {
    mail = useFakeMailer()
    setEventDispatcher(deliver)
  })
  afterEach(() => {
    setEventDispatcher(null)
    setMailer(undefined)
    vi.restoreAllMocks()
  })

  async function campusTeam(o: Parameters<typeof makeCampus>[0] = {}) {
    const campus = await makeCampus({ name: 'Campus Sauzal', ...o })
    const admin = await makeViewer({ campusId: campus.id, role: 'admin' })
    await getDb().update(accounts).set({ firstLoginAt: new Date() }).where(eq(accounts.id, admin.accountId))
    return {
      campus,
      admin,
      staff: await makeViewer({ campusId: campus.id, role: 'staff' }),
      otherStaff: await makeViewer({ campusId: campus.id, role: 'staff' }),
    }
  }

  async function reportIn(campusId: string, o: Parameters<typeof makeReport>[0] = {}) {
    const building = await makeBuilding({ campusId, name: 'Edificio A', nameKey: `edificio a ${Math.random()}` })
    const space = await makeSpace({ buildingId: building.id, name: 'Aula 3', nameKey: 'aula 3' })
    const category = await makeCategory({ campusId, name: 'Fuga de agua', nameKey: `fuga ${Math.random()}` })
    return makeReport({ campusId, buildingId: building.id, spaceId: space.id, categoryId: category.id, ...o })
  }

  async function confirm(reportId: string, viewer: Viewer) {
    await getDb().insert(duplicateConfirmations).values({ reportId, accountId: viewer.accountId })
  }

  const assign = (viewer: Viewer, reportId: string, assigneeId: string) =>
    asViewer(viewer).post(`/api/reports/${reportId}/assignment`, { assigneeId })

  describe('report emails', () => {
    it('RF-NOTIFICACION-01: the account left assigned gets an email, not the previous one', async () => {
      const { campus, admin, staff, otherStaff } = await campusTeam()
      const report = await reportIn(campus.id)
      await assign(admin, report.id, staff.accountId)
      expect(recipients(mail.sent)).toEqual([staff.email])

      mail.sent.length = 0
      await assign(admin, report.id, otherStaff.accountId)
      expect(recipients(mail.sent)).toEqual([otherStaff.email])
    })

    it('RF-NOTIFICACION-06, 07: the assignment email shows campus, building, space, category and the link', async () => {
      const { campus, admin, staff } = await campusTeam()
      const report = await reportIn(campus.id)
      await assign(admin, report.id, staff.accountId)
      const [email] = mail.sent
      expect(email?.subject).toBe('Se te asignó un reporte en Campus Sauzal')
      for (const value of ['Campus Sauzal', 'Edificio A', 'Aula 3', 'Fuga de agua', `${BASE_URL}/reportes/${report.id}`]) {
        expect(email?.text).toContain(value)
      }
    })

    it('RF-NOTIFICACION-09: assigning a report to oneself sends nothing', async () => {
      const { campus, staff } = await campusTeam()
      const report = await reportIn(campus.id)
      expect((await assign(staff, report.id, staff.accountId)).status).toBe(200)
      expect(mail.sent).toEqual([])
    })

    it('RF-NOTIFICACION-02, 07, 09: the resolution goes to the reporter and every confirmer, not to who resolved it', async () => {
      const { campus, staff } = await campusTeam()
      const reporter = await makeViewer()
      const confirmers = [await makeViewer(), await makeViewer()]
      const report = await reportIn(campus.id, {
        reporterId: reporter.accountId,
        status: 'in_review',
        assigneeId: staff.accountId,
        confirmationCount: 2,
      })
      for (const confirmer of confirmers) await confirm(report.id, confirmer)

      expect((await asViewer(staff).post(`/api/reports/${report.id}/resolution`)).status).toBe(200)
      expect(recipients(mail.sent)).toEqual([reporter.email, ...confirmers.map((c) => c.email)].sort())
      for (const email of mail.sent) {
        expect(email.subject).toBe('Se resolvió un reporte en Campus Sauzal')
        expect(email.text).toContain(`${BASE_URL}/reportes/${report.id}`)
      }
    })

    it('RF-NOTIFICACION-03, 08: the cancellation goes to reporter, assignee and confirmers, with the link only for who can see it', async () => {
      const { campus, admin, staff } = await campusTeam()
      const reporter = await makeViewer()
      const confirmer = await makeViewer()
      const report = await reportIn(campus.id, {
        reporterId: reporter.accountId,
        status: 'in_review',
        assigneeId: staff.accountId,
        confirmationCount: 1,
      })
      await confirm(report.id, confirmer)

      expect((await asViewer(admin).post(`/api/reports/${report.id}/cancellation`)).status).toBe(204)
      expect(recipients(mail.sent)).toEqual([reporter.email, staff.email, confirmer.email].sort())
      const link = `${BASE_URL}/reportes/${report.id}`
      const byRecipient = new Map(mail.sent.map((email) => [email.to, email]))
      expect(byRecipient.get(staff.email)?.text).toContain(link)
      expect(byRecipient.get(reporter.email)?.text).not.toContain(link)
      expect(byRecipient.get(confirmer.email)?.text).not.toContain(link)
    })

    it('RF-NOTIFICACION-10: an account that registered the report and is its assignee gets one email', async () => {
      const { campus, admin, staff } = await campusTeam()
      const report = await reportIn(campus.id, { reporterId: staff.accountId, status: 'in_review', assigneeId: staff.accountId })
      await asViewer(admin).post(`/api/reports/${report.id}/cancellation`)
      expect(recipients(mail.sent)).toEqual([staff.email])
    })

    it('RF-NOTIFICACION-09: a reporter cancelling its own report gets nothing', async () => {
      const reporter = await makeViewer()
      const report = await makeReport({ reporterId: reporter.accountId })
      expect((await asViewer(reporter).post(`/api/reports/${report.id}/cancellation`)).status).toBe(204)
      expect(mail.sent).toEqual([])
    })

    it('RF-NOTIFICACION-11: no email shows the address of any person', async () => {
      const { campus, admin, staff } = await campusTeam()
      const reporter = await makeViewer()
      const confirmer = await makeViewer()
      const report = await reportIn(campus.id, { reporterId: reporter.accountId, confirmationCount: 1 })
      await confirm(report.id, confirmer)
      await assign(admin, report.id, staff.accountId)
      await asViewer(staff).post(`/api/reports/${report.id}/resolution`)

      const addresses = [admin, staff, reporter, confirmer].map((v) => v.email)
      expect(mail.sent.length).toBeGreaterThan(0)
      for (const email of mail.sent) {
        for (const address of addresses) {
          expect(email.text).not.toContain(address)
          expect(email.html).not.toContain(address)
        }
      }
    })

    it('RF-NOTIFICACION-20: every email has exactly one recipient', async () => {
      const { campus, staff } = await campusTeam()
      const report = await reportIn(campus.id, { status: 'in_review', assigneeId: staff.accountId, confirmationCount: 2 })
      await confirm(report.id, await makeViewer())
      await confirm(report.id, await makeViewer())
      await asViewer(staff).post(`/api/reports/${report.id}/resolution`)
      expect(mail.sent).toHaveLength(3)
      for (const email of mail.sent) expect(email.to).toMatch(/^[^,;\s]+@uabc\.edu\.mx$/)
      expect(new Set(mail.sent.map((email) => email.to)).size).toBe(3)
    })
  })

  describe('role emails', () => {
    it('RF-NOTIFICACION-04, 05: the account that receives a role gets an email with campus and role, even if it never signed in', async () => {
      const { campus, admin } = await campusTeam()
      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: 'nuevo@uabc.edu.mx', role: 'staff' })
      expect(res.status).toBe(200)
      expect(recipients(mail.sent)).toEqual(['nuevo@uabc.edu.mx'])
      expect(mail.sent[0]?.subject).toBe('Ahora eres Encargado de Campus Sauzal en Cima Fix')
      expect(mail.sent[0]?.text).toContain('Campus Sauzal')
      expect(mail.sent[0]?.text).toContain('Encargado')
    })

    it('RF-NOTIFICACION-09: an admin changing its own role gets nothing', async () => {
      const { campus, admin } = await campusTeam()
      const second = await makeViewer({ campusId: campus.id, role: 'admin' })
      await getDb().update(accounts).set({ firstLoginAt: new Date() }).where(eq(accounts.id, second.accountId))
      expect((await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: admin.email, role: 'staff' })).status).toBe(200)
      expect(mail.sent).toEqual([])
    })
  })

  describe('alerts', () => {
    it('RF-NOTIFICACION-17, 18, 19: reaching the in review threshold alerts every staff member and admin, including the actor', async () => {
      const { campus, admin, staff, otherStaff } = await campusTeam({ alertThresholdInReview: 1 })
      const reporter = await makeViewer()
      const foreignStaff = await makeViewer({ campusId: (await makeCampus()).id, role: 'staff' })
      const report = await reportIn(campus.id, { reporterId: reporter.accountId })

      await assign(staff, report.id, otherStaff.accountId)
      const alerts = mail.sent.filter((email) => email.subject.startsWith('Alerta'))
      // RF-NOTIFICACION-12: nobody of another campus, nor the reporter.
      expect(recipients(alerts)).toEqual([admin.email, staff.email, otherStaff.email].sort())
      expect(recipients(alerts)).not.toContain(foreignStaff.email)
      expect(alerts[0]?.subject).toBe('Alerta: 1 reporte en estado En revisión en Campus Sauzal')
    })

    it('RF-NOTIFICACION-16: setting the new threshold at the current count sends the alert once', async () => {
      const { campus, admin, staff, otherStaff } = await campusTeam()
      await reportIn(campus.id)
      await reportIn(campus.id)
      const api = asViewer(admin)

      expect((await api.put(`/api/campuses/${campus.id}/alert-thresholds`, { new: 2, inReview: null })).status).toBe(200)
      expect(recipients(mail.sent)).toEqual([admin.email, staff.email, otherStaff.email].sort())
      expect(mail.sent[0]?.text).toContain('2 reportes en estado Nuevo')

      // Staying at or above the threshold does not reach it again (RN-07).
      mail.sent.length = 0
      await api.put(`/api/campuses/${campus.id}/alert-thresholds`, { new: 1, inReview: null })
      expect(mail.sent).toEqual([])
    })

    it('RF-NOTIFICACION-16: a threshold above the count sends nothing', async () => {
      const { campus, admin } = await campusTeam()
      await reportIn(campus.id)
      await asViewer(admin).put(`/api/campuses/${campus.id}/alert-thresholds`, { new: 5, inReview: 5 })
      expect(mail.sent).toEqual([])
    })
  })

  describe('PUT /api/campuses/:id/alert-thresholds', () => {
    it('RF-NOTIFICACION-14: sets, changes and removes each threshold, without touching other campuses', async () => {
      const { campus, admin } = await campusTeam()
      const other = await makeCampus({ alertThresholdNew: 9, alertThresholdInReview: 9 })
      const api = asViewer(admin)
      const stored = async (id: string) =>
        (await getDb()
          .select({ new: campuses.alertThresholdNew, inReview: campuses.alertThresholdInReview })
          .from(campuses)
          .where(eq(campuses.id, id)))[0]

      const res = await api.put(`/api/campuses/${campus.id}/alert-thresholds`, { new: 10, inReview: 5 })
      expect(await res.json()).toEqual({ new: 10, inReview: 5 })
      expect(await stored(campus.id)).toEqual({ new: 10, inReview: 5 })

      await api.put(`/api/campuses/${campus.id}/alert-thresholds`, { new: 3, inReview: null })
      expect(await stored(campus.id)).toEqual({ new: 3, inReview: null })
      expect(await stored(other.id)).toEqual({ new: 9, inReview: 9 })
    })

    it('RF-NOTIFICACION-13: only an admin of the campus configures it', async () => {
      const { campus, staff } = await campusTeam()
      const { admin: foreignAdmin } = await campusTeam()
      for (const viewer of [staff, await makeViewer(), foreignAdmin]) {
        const res = await asViewer(viewer).put(`/api/campuses/${campus.id}/alert-thresholds`, { new: 1, inReview: 1 })
        expect(res.status).toBe(403)
      }
    })

    it('RF-NOTIFICACION-15: accepts only integers of at least 1, or null', async () => {
      const { campus, admin } = await campusTeam()
      const api = asViewer(admin)
      for (const value of [0, -1, 1.5, '3', true]) {
        const res = await api.put(`/api/campuses/${campus.id}/alert-thresholds`, { new: value, inReview: null })
        expect(res.status).toBe(400)
      }
      expect((await api.put(`/api/campuses/${campus.id}/alert-thresholds`, { new: 1 })).status).toBe(400)
      expect((await api.put(`/api/campuses/${campus.id}/alert-thresholds`, { new: 1, inReview: null })).status).toBe(200)
    })
  })

  describe('availability', () => {
    it('RNF-DISPONIBILIDAD-05: with Resend down the action still completes', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      mail.state.down = true
      const { campus, admin, staff } = await campusTeam()
      const report = await reportIn(campus.id)

      const res = await assign(admin, report.id, staff.accountId)
      expect(res.status).toBe(200)
      const [row] = await getDb().select().from(reports).where(eq(reports.id, report.id))
      expect(row).toMatchObject({ status: 'in_review', assigneeId: staff.accountId })
      expect(errors).toHaveBeenCalled()
    })

    it('RNF-DISPONIBILIDAD-06: a failed email is not sent again once Resend is back', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { campus, admin, staff, otherStaff } = await campusTeam()
      const report = await reportIn(campus.id)

      mail.state.down = true
      await assign(admin, report.id, staff.accountId)
      expect(mail.state.calls).toBe(1)

      mail.state.down = false
      await assign(admin, report.id, otherStaff.accountId)
      expect(mail.state.calls).toBe(2)
      expect(recipients(mail.sent)).toEqual([otherStaff.email])
    })

    it('RNF-RENDIMIENTO-05: the response does not wait for the emails, which are handed to the mailer right after', async () => {
      let release = () => {}
      const handed: Email[] = []
      setMailer({
        send: (emails) => {
          handed.push(...emails)
          return new Promise<void>((resolve) => {
            release = resolve
          })
        },
      })
      startNotifications()
      const { campus, admin, staff } = await campusTeam()
      const report = await reportIn(campus.id)

      // The mailer never answers until released, and the action has already answered.
      expect((await assign(admin, report.id, staff.accountId)).status).toBe(200)
      await vi.waitFor(() => expect(handed.map((email) => email.to)).toEqual([staff.email]))
      release()
    })
  })
})