import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getDb } from '../../src/server/db/client.ts'
import { buildings, categories, reports, spaces } from '../../src/server/db/schema.ts'
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

type Json = Record<string, unknown>

describe('catalog', () => {
  useTestDb()

  async function campusWithAdmin() {
    const campus = await makeCampus()
    const admin = await makeViewer({ campusId: campus.id, role: 'admin' })
    return { campus, admin, api: asViewer(admin) }
  }

  describe('permissions', () => {
    it('RF-ACCESO-01: every catalog route answers 401 without a session', async () => {
      const campus = await makeCampus()
      const api = asViewer(null)
      for (const path of [
        '/api/campuses',
        `/api/campuses/${campus.id}/report-options`,
        `/api/campuses/${campus.id}/filter-options`,
        `/api/campuses/${campus.id}/catalog`,
        '/api/spaces/link/K7P2X9QM4A',
      ]) {
        expect((await api.get(path)).status, path).toBe(401)
      }
      expect((await api.post(`/api/campuses/${campus.id}/buildings`, { name: 'A' })).status).toBe(401)
    })

    it('RF-CATALOGO-01: staff, reporters and admins of another campus cannot manage the catalog', async () => {
      const { campus } = await campusWithAdmin()
      const other = await makeCampus()
      const building = await makeBuilding({ campusId: campus.id })
      for (const viewer of [
        await makeViewer({ campusId: campus.id, role: 'staff' }),
        await makeViewer(),
        await makeViewer({ campusId: other.id, role: 'admin' }),
      ]) {
        const api = asViewer(viewer)
        const responses = [
          await api.get(`/api/campuses/${campus.id}/catalog`),
          await api.post(`/api/campuses/${campus.id}/buildings`, { name: 'Edificio nuevo' }),
          await api.patch(`/api/buildings/${building.id}`, { name: 'Otro' }),
          await api.post(`/api/buildings/${building.id}/spaces`, { name: 'Aula' }),
          await api.post(`/api/campuses/${campus.id}/categories`, { name: 'Agua', severity: 'high' }),
        ]
        for (const res of responses) {
          expect(res.status).toBe(403)
          expect(await res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
        }
      }
      expect(await getDb().select().from(buildings).where(eq(buildings.campusId, campus.id))).toHaveLength(1)
    })

    it('RF-CATALOGO-12: there is no route to delete catalog items', async () => {
      const { campus, api } = await campusWithAdmin()
      const building = await makeBuilding({ campusId: campus.id })
      expect((await api.delete(`/api/buildings/${building.id}`)).status).toBe(405)
    })

    it('answers 404 for an item that does not exist', async () => {
      const { api } = await campusWithAdmin()
      const missing = '00000000-0000-4000-8000-000000000000'
      expect((await api.patch(`/api/buildings/${missing}`, { name: 'X' })).status).toBe(404)
      expect((await api.patch(`/api/spaces/${missing}`, { name: 'X' })).status).toBe(404)
      expect((await api.patch(`/api/categories/${missing}`, { name: 'X' })).status).toBe(404)
    })
  })

  describe('management', () => {
    it('RF-CATALOGO-02, 04, 06, 14: creates a building, a space with its link and a category', async () => {
      const { campus, api } = await campusWithAdmin()
      const building = await api.post(`/api/campuses/${campus.id}/buildings`, { name: '  Edificio   5 ' })
      expect(building.status).toBe(201)
      const buildingBody = (await building.json()) as Json
      expect(buildingBody).toMatchObject({ name: 'Edificio 5', isActive: true, position: null })

      const space = await api.post(`/api/buildings/${String(buildingBody.id)}/spaces`, { name: 'Salón 204' })
      expect(space.status).toBe(201)
      expect(await space.json()).toMatchObject({
        name: 'Salón 204',
        buildingId: buildingBody.id,
        linkCode: expect.stringMatching(/^[23456789A-HJKMNP-Z]{10}$/),
      })

      const category = await api.post(`/api/campuses/${campus.id}/categories`, {
        name: 'Iluminación',
        severity: 'high',
      })
      expect(category.status).toBe(201)
      expect(await category.json()).toMatchObject({ name: 'Iluminación', severity: 'high', isActive: true })
    })

    it('RF-CATALOGO-18: a category cannot be created without severity', async () => {
      const { campus, api } = await campusWithAdmin()
      const res = await api.post(`/api/campuses/${campus.id}/categories`, { name: 'Agua' })
      expect(res.status).toBe(400)
    })

    it('RF-CATALOGO-08: rejects a repeated name ignoring case, accents and spaces, even if deactivated', async () => {
      const { campus, api } = await campusWithAdmin()
      const building = await makeBuilding({ campusId: campus.id, name: 'Edificio Ñandú', nameKey: 'edificio ñandu', isActive: false })
      await makeCategory({ campusId: campus.id, name: 'Eléctrico', nameKey: 'electrico' })
      await makeSpace({ buildingId: building.id, name: 'Aula 1', nameKey: 'aula 1' })

      const responses = [
        await api.post(`/api/campuses/${campus.id}/buildings`, { name: '  EDIFICIO   ñandu ' }),
        await api.post(`/api/campuses/${campus.id}/categories`, { name: 'electrico', severity: 'low' }),
        await api.post(`/api/buildings/${building.id}/spaces`, { name: 'AULA 1' }),
      ]
      for (const res of responses) {
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ error: { code: 'NAME_TAKEN', field: 'name' } })
      }
    })

    it('RF-CATALOGO-08: "ñ" is a letter of its own, so "Peña" and "Pena" are different names', async () => {
      const { campus, api } = await campusWithAdmin()
      expect((await api.post(`/api/campuses/${campus.id}/buildings`, { name: 'Edificio Peña' })).status).toBe(201)
      expect((await api.post(`/api/campuses/${campus.id}/buildings`, { name: 'Edificio Pena' })).status).toBe(201)
      expect((await api.post(`/api/campuses/${campus.id}/buildings`, { name: 'EDIFICIO PEÑA' })).status).toBe(409)
    })

    it('RF-CATALOGO-08: the same name is allowed in another scope', async () => {
      const { campus, api } = await campusWithAdmin()
      const other = await makeCampus()
      await makeBuilding({ campusId: other.id, name: 'Edificio A', nameKey: 'edificio a' })
      const first = await makeBuilding({ campusId: campus.id })
      const second = await makeBuilding({ campusId: campus.id })
      await makeSpace({ buildingId: first.id, name: 'Aula 1', nameKey: 'aula 1' })

      expect((await api.post(`/api/campuses/${campus.id}/buildings`, { name: 'Edificio A' })).status).toBe(201)
      expect((await api.post(`/api/buildings/${second.id}/spaces`, { name: 'Aula 1' })).status).toBe(201)
    })

    it('RF-CATALOGO-03, 08: renames, and rejects renaming onto an existing name', async () => {
      const { campus, api } = await campusWithAdmin()
      const building = await makeBuilding({ campusId: campus.id })
      await makeBuilding({ campusId: campus.id, name: 'Biblioteca', nameKey: 'biblioteca' })

      const renamed = await api.patch(`/api/buildings/${building.id}`, { name: 'Gimnasio' })
      expect(await renamed.json()).toMatchObject({ name: 'Gimnasio' })
      const taken = await api.patch(`/api/buildings/${building.id}`, { name: 'BIBLIOTECA' })
      expect(taken.status).toBe(409)
    })

    it('RF-CATALOGO-15: renaming a space or its building keeps its link', async () => {
      const { campus, api } = await campusWithAdmin()
      const building = await makeBuilding({ campusId: campus.id })
      const space = await makeSpace({ buildingId: building.id })
      await api.patch(`/api/spaces/${space.id}`, { name: 'Laboratorio' })
      await api.patch(`/api/buildings/${building.id}`, { name: 'Edificio nuevo' })
      const [after] = await getDb().select().from(spaces).where(eq(spaces.id, space.id))
      expect(after?.linkCode).toBe(space.linkCode)
    })

    it('RF-CATALOGO-13, 19: sets, moves and removes the position of a building', async () => {
      const { campus, api } = await campusWithAdmin()
      const building = await makeBuilding({ campusId: campus.id })
      const path = `/api/buildings/${building.id}`
      expect(await (await api.patch(path, { position: { x: 100, y: 50.5 } })).json()).toMatchObject({
        position: { x: 100, y: 50.5 },
      })
      expect(await (await api.patch(path, { position: { x: 2000, y: 1200 } })).json()).toMatchObject({
        position: { x: 2000, y: 1200 },
      })
      expect(await (await api.patch(path, { position: null })).json()).toMatchObject({ position: null })
    })

    it('rejects a position outside the plan of the campus', async () => {
      const { campus, api } = await campusWithAdmin()
      const building = await makeBuilding({ campusId: campus.id })
      const res = await api.patch(`/api/buildings/${building.id}`, { position: { x: 2001, y: 10 } })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { field: 'position' } })
    })

    it('RF-CATALOGO-09, 21: deactivates and reactivates; a building or category with open reports cannot be deactivated', async () => {
      const { campus, api, admin } = await campusWithAdmin()
      const report = await makeReport({ campusId: campus.id })

      for (const path of [`/api/buildings/${report.buildingId}`, `/api/categories/${report.categoryId}`]) {
        const res = await api.patch(path, { isActive: false })
        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ error: { code: 'HAS_OPEN_REPORTS' } })
      }
      // A space can be deactivated even with open reports (RF-CATALOGO-21 names only buildings and categories).
      expect((await api.patch(`/api/spaces/${report.spaceId}`, { isActive: false })).status).toBe(200)

      await getDb()
        .update(reports)
        .set({ status: 'resolved', assigneeId: admin.accountId, resolvedAt: new Date() })
        .where(eq(reports.id, report.id))
      for (const path of [`/api/buildings/${report.buildingId}`, `/api/categories/${report.categoryId}`]) {
        expect(await (await api.patch(path, { isActive: false })).json()).toMatchObject({ isActive: false })
        expect(await (await api.patch(path, { isActive: true })).json()).toMatchObject({ isActive: true })
      }
    })

    it('RF-PRIORIDAD-05, 06: a new severity recalculates open reports and leaves closed ones as they were', async () => {
      const { campus, api, admin } = await campusWithAdmin()
      const category = await makeCategory({ campusId: campus.id, severity: 1 })
      const open = await makeReport({ campusId: campus.id, categoryId: category.id, priority: 1 })
      const confirmed = await makeReport({
        campusId: campus.id,
        categoryId: category.id,
        priority: 2,
        confirmationCount: 3,
      })
      const resolved = await makeReport({
        campusId: campus.id,
        categoryId: category.id,
        priority: 1,
        status: 'resolved',
        assigneeId: admin.accountId,
        resolvedAt: new Date(),
      })

      const res = await api.patch(`/api/categories/${category.id}`, { severity: 'medium' })
      expect(await res.json()).toMatchObject({ severity: 'medium' })
      const priorityOf = async (id: string) =>
        (await getDb().select().from(reports).where(eq(reports.id, id)))[0]?.priority
      expect(await priorityOf(open.id)).toBe(2)
      expect(await priorityOf(confirmed.id)).toBe(3)
      expect(await priorityOf(resolved.id)).toBe(1)
    })
  })

  describe('queries', () => {
    it('RF-GESTION-24: lists only active campuses', async () => {
      const active = await makeCampus({ name: 'Campus Sauzal' })
      await makeCampus({ isActive: false })
      const res = await asViewer(await makeViewer()).get('/api/campuses')
      expect(await res.json()).toEqual([{ id: active.id, slug: active.slug, name: 'Campus Sauzal' }])
    })

    it('RF-CATALOGO-10, RF-REPORTE-12: report options leave out what is not offered', async () => {
      const campus = await makeCampus()
      const offered = await makeBuilding({ campusId: campus.id, name: 'B', nameKey: 'b' })
      const activeSpace = await makeSpace({ buildingId: offered.id, name: 'Aula 2', nameKey: 'aula 2' })
      await makeSpace({ buildingId: offered.id, isActive: false })
      const withoutSpaces = await makeBuilding({ campusId: campus.id, name: 'A', nameKey: 'a' })
      await makeSpace({ buildingId: withoutSpaces.id, isActive: false })
      const inactive = await makeBuilding({ campusId: campus.id, isActive: false })
      await makeSpace({ buildingId: inactive.id })
      const category = await makeCategory({ campusId: campus.id, name: 'Agua', nameKey: 'agua' })
      await makeCategory({ campusId: campus.id, isActive: false })

      const res = await asViewer(await makeViewer()).get(`/api/campuses/${campus.id}/report-options`)
      expect(await res.json()).toEqual({
        buildings: [{ id: offered.id, name: 'B', spaces: [{ id: activeSpace.id, name: 'Aula 2' }] }],
        categories: [{ id: category.id, name: 'Agua' }],
      })
    })

    it('RF-GESTION-04: filter options include active buildings without active spaces', async () => {
      const campus = await makeCampus()
      const withoutSpaces = await makeBuilding({ campusId: campus.id, name: 'A', nameKey: 'a' })
      await makeBuilding({ campusId: campus.id, isActive: false })
      const category = await makeCategory({ campusId: campus.id, name: 'Agua', nameKey: 'agua' })

      const res = await asViewer(await makeViewer()).get(`/api/campuses/${campus.id}/filter-options`)
      expect(await res.json()).toEqual({
        buildings: [{ id: withoutSpaces.id, name: 'A' }],
        categories: [{ id: category.id, name: 'Agua' }],
      })
    })

    it('RF-REPORTE-12: an inactive or unknown campus has no options', async () => {
      const inactive = await makeCampus({ isActive: false })
      const api = asViewer(await makeViewer())
      for (const id of [inactive.id, '00000000-0000-4000-8000-000000000000']) {
        expect((await api.get(`/api/campuses/${id}/report-options`)).status).toBe(404)
        expect((await api.get(`/api/campuses/${id}/filter-options`)).status).toBe(404)
      }
    })

    it('RF-CATALOGO-16, 20: the admin sees the whole catalog with states and links', async () => {
      const { campus, api } = await campusWithAdmin()
      const building = await makeBuilding({ campusId: campus.id, isActive: false, positionX: 10, positionY: 20 })
      const space = await makeSpace({ buildingId: building.id, isActive: false })
      const category = await makeCategory({ campusId: campus.id, severity: 3, isActive: false })

      const res = await api.get(`/api/campuses/${campus.id}/catalog`)
      expect(await res.json()).toEqual({
        buildings: [
          {
            id: building.id,
            name: building.name,
            isActive: false,
            position: { x: 10, y: 20 },
            spaces: [{ id: space.id, name: space.name, isActive: false, linkCode: space.linkCode }],
          },
        ],
        categories: [{ id: category.id, name: category.name, severity: 'high', isActive: false }],
      })
    })
  })

  describe('space links (SDD 10.9)', () => {
    async function link(code: string) {
      const res = await asViewer(await makeViewer()).get(`/api/spaces/link/${code}`)
      expect(res.status).toBe(200)
      return res.json()
    }

    it('RF-REPORTE-05: preselects campus, building and space of an offered space, in any letter case', async () => {
      const campus = await makeCampus()
      const building = await makeBuilding({ campusId: campus.id })
      const space = await makeSpace({ buildingId: building.id })
      expect(await link(space.linkCode.toLowerCase())).toEqual({
        preselect: { campusId: campus.id, buildingId: building.id, spaceId: space.id },
        unavailable: false,
      })
    })

    it('RF-REPORTE-10: an inactive space in an offered building preselects campus and building', async () => {
      const campus = await makeCampus()
      const building = await makeBuilding({ campusId: campus.id })
      await makeSpace({ buildingId: building.id })
      const space = await makeSpace({ buildingId: building.id, isActive: false })
      expect(await link(space.linkCode)).toEqual({
        preselect: { campusId: campus.id, buildingId: building.id },
        unavailable: true,
      })
    })

    it('RF-REPORTE-10: a space whose building is not offered preselects only the campus', async () => {
      const campus = await makeCampus()
      const building = await makeBuilding({ campusId: campus.id, isActive: false })
      const space = await makeSpace({ buildingId: building.id })
      expect(await link(space.linkCode)).toEqual({ preselect: { campusId: campus.id }, unavailable: true })
    })

    it('RF-REPORTE-10: a space of an inactive campus, or a code that matches nothing, preselects nothing', async () => {
      const campus = await makeCampus({ isActive: false })
      const space = await makeSpace({ buildingId: (await makeBuilding({ campusId: campus.id })).id })
      for (const code of [space.linkCode, 'K7P2X9QM4A', 'no-es-un-codigo']) {
        expect(await link(code)).toEqual({ preselect: {}, unavailable: true })
      }
    })
  })

  it('keeps the data of the catalog as stored', async () => {
    const { campus, api } = await campusWithAdmin()
    await api.post(`/api/campuses/${campus.id}/categories`, { name: '  Fugas   de  agua ', severity: 'low' })
    const [row] = await getDb().select().from(categories).where(eq(categories.campusId, campus.id))
    expect(row).toMatchObject({ name: 'Fugas de agua', nameKey: 'fugas de agua', severity: 1 })
  })
})
