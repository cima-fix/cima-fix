import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { setEventDispatcher } from '../../src/server/db/campus-lock.ts'
import { getDb } from '../../src/server/db/client.ts'
import { accounts, campusRoles } from '../../src/server/db/schema.ts'
import type { DomainEvent } from '../../src/shared/types/events.ts'
import type { Viewer } from '../../src/shared/types/viewer.ts'
import { asViewer } from '../helpers/as-viewer.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeAccount, makeCampus, makeCampusRole, makeReport, makeViewer } from '../helpers/factories.ts'

describe('access: roles', () => {
  useTestDb()
  afterEach(() => setEventDispatcher(null))

  // A campus with an admin that already signed in, so RF-ACCESO-10 holds before each change.
  async function campusWithAdmin(o: Parameters<typeof makeCampus>[0] = {}) {
    const campus = await makeCampus(o)
    const admin = await makeViewer({ campusId: campus.id, role: 'admin' })
    await getDb().update(accounts).set({ firstLoginAt: new Date() }).where(eq(accounts.id, admin.accountId))
    return { campus, admin }
  }

  async function roleOf(campusId: string, accountId: string) {
    const [row] = await getDb()
      .select({ role: campusRoles.role })
      .from(campusRoles)
      .where(and(eq(campusRoles.campusId, campusId), eq(campusRoles.accountId, accountId)))
    return row?.role ?? 'reporter'
  }

  function captureEvents() {
    const events: DomainEvent[] = []
    setEventDispatcher((batch) => {
      events.push(...batch)
    })
    return events
  }

  describe('PUT /api/campuses/:id/roles', () => {
    it('RF-ACCESO-06: assigns a role to an account that never signed in, creating it in advance', async () => {
      const { campus, admin } = await campusWithAdmin()
      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, {
        email: 'Nuevo@UABC.edu.mx',
        role: 'staff',
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { accountId: string }
      expect(body).toMatchObject({ email: 'nuevo@uabc.edu.mx', role: 'staff', hasLoggedIn: false })
      expect(await roleOf(campus.id, body.accountId)).toBe('staff')
    })

    it('RF-ACCESO-06: assigns a role to an existing account', async () => {
      const { campus, admin } = await campusWithAdmin()
      const account = await makeAccount({ firstLoginAt: new Date() })
      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: account.email, role: 'admin' })
      expect(await res.json()).toEqual({ accountId: account.id, email: account.email, role: 'admin', hasLoggedIn: true })
      expect(await getDb().select().from(accounts)).toHaveLength(2)
    })

    it('RF-ACCESO-04: the new role replaces the previous one only in that campus', async () => {
      const { campus, admin } = await campusWithAdmin()
      const other = await makeCampus()
      const account = await makeAccount()
      await makeCampusRole({ campusId: campus.id, accountId: account.id, role: 'admin' })
      await makeCampusRole({ campusId: other.id, accountId: account.id, role: 'staff' })

      await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: account.email, role: 'staff' })
      expect(await roleOf(campus.id, account.id)).toBe('staff')
      expect(await roleOf(other.id, account.id)).toBe('staff')
      const rows = await getDb().select().from(campusRoles).where(eq(campusRoles.accountId, account.id))
      expect(rows).toHaveLength(2)
    })

    it('RF-ACCESO-05: rejects the assignment by staff, by a reporter and by an admin of another campus', async () => {
      const { campus } = await campusWithAdmin()
      const { admin: otherAdmin } = await campusWithAdmin()
      const viewers: Viewer[] = [
        await makeViewer({ campusId: campus.id, role: 'staff' }),
        await makeViewer(),
        otherAdmin,
      ]
      for (const viewer of viewers) {
        const res = await asViewer(viewer).put(`/api/campuses/${campus.id}/roles`, { email: 'x@uabc.edu.mx', role: 'staff' })
        expect(res.status).toBe(403)
      }
      expect(await getDb().select().from(accounts).where(eq(accounts.email, 'x@uabc.edu.mx'))).toHaveLength(0)
    })

    it('RF-ACCESO-08: rejects an email of another domain and accepts one @uabc.edu.mx', async () => {
      const { campus, admin } = await campusWithAdmin()
      const api = asViewer(admin)
      for (const email of ['ana@gmail.com', 'ana@alumnos.uabc.edu.mx', 'ana@uabc.edu.mx.com']) {
        const res = await api.put(`/api/campuses/${campus.id}/roles`, { email, role: 'staff' })
        expect(res.status).toBe(400)
        expect(await res.json()).toMatchObject({ error: { field: 'email' } })
      }
      expect((await api.put(`/api/campuses/${campus.id}/roles`, { email: 'ana@uabc.edu.mx', role: 'staff' })).status).toBe(200)
    })

    it('rejects a role other than staff or admin and unknown fields', async () => {
      const { campus, admin } = await campusWithAdmin()
      const api = asViewer(admin)
      expect((await api.put(`/api/campuses/${campus.id}/roles`, { email: 'a@uabc.edu.mx', role: 'reporter' })).status).toBe(400)
      expect(
        (await api.put(`/api/campuses/${campus.id}/roles`, { email: 'a@uabc.edu.mx', role: 'staff', campusId: campus.id })).status,
      ).toBe(400)
    })

    it('answers 404 for a campus that does not exist', async () => {
      const ghost = '00000000-0000-4000-8000-000000000000'
      const admin: Viewer = { ...(await makeViewer()), roles: new Map([[ghost, 'admin']]) }
      const res = await asViewer(admin).put(`/api/campuses/${ghost}/roles`, { email: 'a@uabc.edu.mx', role: 'staff' })
      expect(res.status).toBe(404)
    })

    it('RF-ACCESO-09: rejects changing staff to admin with open reports assigned in the campus', async () => {
      const { campus, admin } = await campusWithAdmin()
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })

      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: staff.email, role: 'admin' })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'STAFF_HAS_OPEN_REPORTS' } })
      expect(await roleOf(campus.id, staff.accountId)).toBe('staff')
    })

    it('RF-ACCESO-09: accepts the change with only resolved or cancelled reports assigned', async () => {
      const { campus, admin } = await campusWithAdmin()
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      await makeReport({ campusId: campus.id, status: 'resolved', assigneeId: staff.accountId, resolvedAt: new Date() })
      await makeReport({ campusId: campus.id, status: 'cancelled', assigneeId: staff.accountId, cancelledAt: new Date() })
      // An open report assigned in ANOTHER campus does not count.
      const other = await makeCampus()
      await makeCampusRole({ campusId: other.id, accountId: staff.accountId, role: 'staff' })
      await makeReport({ campusId: other.id, status: 'in_review', assigneeId: staff.accountId })

      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: staff.email, role: 'admin' })
      expect(res.status).toBe(200)
      expect(await roleOf(campus.id, staff.accountId)).toBe('admin')
    })

    it('RF-ACCESO-10: rejects an admin demoting itself when it is the only admin that signed in', async () => {
      const { campus, admin } = await campusWithAdmin()
      // Another admin that never signed in does not count.
      const neverSignedIn = await makeAccount()
      await makeCampusRole({ campusId: campus.id, accountId: neverSignedIn.id, role: 'admin' })

      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: admin.email, role: 'staff' })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'LAST_ADMIN' } })
      expect(await roleOf(campus.id, admin.accountId)).toBe('admin')
    })

    it('RF-ACCESO-10: accepts the change when another admin that signed in remains', async () => {
      const { campus, admin } = await campusWithAdmin()
      const second = await makeAccount({ firstLoginAt: new Date() })
      await makeCampusRole({ campusId: campus.id, accountId: second.id, role: 'admin' })

      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: admin.email, role: 'staff' })
      expect(res.status).toBe(200)
      expect(await roleOf(campus.id, admin.accountId)).toBe('staff')
    })

    it('RF-ACCESO-10: an inactive campus may be left without an admin that signed in', async () => {
      const { campus, admin } = await campusWithAdmin({ isActive: false })
      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: admin.email, role: 'staff' })
      expect(res.status).toBe(200)
    })

    it('RF-NOTIFICACION-04: emits RoleAssigned after the commit, also for an account that never signed in', async () => {
      const { campus, admin } = await campusWithAdmin()
      const events = captureEvents()
      const res = await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: 'nuevo@uabc.edu.mx', role: 'staff' })
      const { accountId } = (await res.json()) as { accountId: string }
      expect(events).toEqual([
        { type: 'RoleAssigned', campusId: campus.id, actorId: admin.accountId, accountId, role: 'staff' },
      ])
    })

    it('emits nothing when the change is rejected or the role does not change', async () => {
      const { campus, admin } = await campusWithAdmin()
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      const events = captureEvents()
      await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: admin.email, role: 'staff' }) // LAST_ADMIN
      await asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: staff.email, role: 'staff' }) // same role
      expect(events).toEqual([])
    })
  })

  describe('DELETE /api/campuses/:id/roles/:accountId', () => {
    it('RF-ACCESO-07: removing the role leaves the account as reporter in that campus', async () => {
      const { campus, admin } = await campusWithAdmin()
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      const res = await asViewer(admin).delete(`/api/campuses/${campus.id}/roles/${staff.accountId}`)
      expect(res.status).toBe(204)
      expect(await roleOf(campus.id, staff.accountId)).toBe('reporter')
    })

    it('RF-ACCESO-05: rejects the removal by an account without admin in that campus', async () => {
      const { campus } = await campusWithAdmin()
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      const { admin: otherAdmin } = await campusWithAdmin()
      for (const viewer of [staff, otherAdmin, await makeViewer()]) {
        const res = await asViewer(viewer).delete(`/api/campuses/${campus.id}/roles/${staff.accountId}`)
        expect(res.status).toBe(403)
      }
      expect(await roleOf(campus.id, staff.accountId)).toBe('staff')
    })

    it('RF-ACCESO-09: rejects removing staff with open reports assigned in the campus', async () => {
      const { campus, admin } = await campusWithAdmin()
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      await makeReport({ campusId: campus.id, status: 'in_review', assigneeId: staff.accountId })
      const res = await asViewer(admin).delete(`/api/campuses/${campus.id}/roles/${staff.accountId}`)
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'STAFF_HAS_OPEN_REPORTS' } })
      expect(await roleOf(campus.id, staff.accountId)).toBe('staff')
    })

    it('RF-ACCESO-10: rejects removing the only admin that signed in', async () => {
      const { campus, admin } = await campusWithAdmin()
      const res = await asViewer(admin).delete(`/api/campuses/${campus.id}/roles/${admin.accountId}`)
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'LAST_ADMIN' } })
      expect(await roleOf(campus.id, admin.accountId)).toBe('admin')
    })

    it('answers 404 when the account has no role in the campus', async () => {
      const { campus, admin } = await campusWithAdmin()
      const reporter = await makeAccount()
      const res = await asViewer(admin).delete(`/api/campuses/${campus.id}/roles/${reporter.id}`)
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: { code: 'ROLE_NOT_FOUND' } })
    })

    it('sends no email (SDD 8.4)', async () => {
      const { campus, admin } = await campusWithAdmin()
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      const events = captureEvents()
      await asViewer(admin).delete(`/api/campuses/${campus.id}/roles/${staff.accountId}`)
      expect(events).toEqual([])
    })
  })

  describe('GET /api/campuses/:id/roles', () => {
    it('RF-ACCESO-11: lists staff and admins with email and role, including the ones that never signed in', async () => {
      const { campus, admin } = await campusWithAdmin()
      const staff = await makeAccount({ email: 'b@uabc.edu.mx' })
      await makeCampusRole({ campusId: campus.id, accountId: staff.id, role: 'staff' })
      // Reporters and roles in other campuses are not listed.
      await makeAccount()
      const other = await makeCampus()
      await makeCampusRole({ campusId: other.id, accountId: (await makeAccount()).id, role: 'admin' })

      const res = await asViewer(admin).get(`/api/campuses/${campus.id}/roles`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([
        { accountId: admin.accountId, email: admin.email, role: 'admin', hasLoggedIn: true },
        { accountId: staff.id, email: 'b@uabc.edu.mx', role: 'staff', hasLoggedIn: false },
      ])
    })

    it('RF-ACCESO-12: accepts staff and admins of the campus and rejects everyone else', async () => {
      const { campus, admin } = await campusWithAdmin()
      const staff = await makeViewer({ campusId: campus.id, role: 'staff' })
      const { admin: otherAdmin } = await campusWithAdmin()
      const otherStaff = await makeViewer({ campusId: (await makeCampus()).id, role: 'staff' })

      for (const viewer of [admin, staff]) {
        expect((await asViewer(viewer).get(`/api/campuses/${campus.id}/roles`)).status).toBe(200)
      }
      for (const viewer of [await makeViewer(), otherAdmin, otherStaff]) {
        expect((await asViewer(viewer).get(`/api/campuses/${campus.id}/roles`)).status).toBe(403)
      }
    })
  })

  it('serializes two changes on the same campus (DD-08): two admins demoting themselves at once', async () => {
    const { campus, admin } = await campusWithAdmin()
    const second = await makeViewer({ campusId: campus.id, role: 'admin' })
    await getDb().update(accounts).set({ firstLoginAt: new Date() }).where(eq(accounts.id, second.accountId))

    const results = await Promise.all([
      asViewer(admin).put(`/api/campuses/${campus.id}/roles`, { email: admin.email, role: 'staff' }),
      asViewer(second).put(`/api/campuses/${campus.id}/roles`, { email: second.email, role: 'staff' }),
    ])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
  })
})