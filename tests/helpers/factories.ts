import { randomUUID } from 'node:crypto'
import { getDb } from '../../src/server/db/client.ts'
import {
  accounts,
  buildings,
  campusRoles,
  campuses,
  categories,
  reports,
  spaces,
} from '../../src/server/db/schema.ts'
import type { StaffRole } from '../../src/shared/types/common'
import type { Viewer } from '../../src/shared/types/viewer'

let counter = 0
const next = () => ++counter

function one<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error('Factory insert returned no row')
  return row
}

export async function makeCampus(o: Partial<typeof campuses.$inferInsert> = {}) {
  const i = next()
  return one(
    await getDb()
      .insert(campuses)
      .values({
        slug: `campus-${i}`,
        name: `Campus ${i}`,
        floorPlanPublicId: `plans/campus-${i}`,
        floorPlanWidth: 2000,
        floorPlanHeight: 1200,
        ...o,
      })
      .returning(),
  )
}

export async function makeAccount(o: Partial<typeof accounts.$inferInsert> = {}) {
  const i = next()
  return one(
    await getDb()
      .insert(accounts)
      .values({ email: `user${i}@uabc.edu.mx`, ...o })
      .returning(),
  )
}

export async function makeCampusRole(o: typeof campusRoles.$inferInsert) {
  return one(await getDb().insert(campusRoles).values(o).returning())
}

export async function makeBuilding(
  o: Partial<typeof buildings.$inferInsert> & { campusId: string },
) {
  const i = next()
  return one(
    await getDb()
      .insert(buildings)
      .values({ name: `Edificio ${i}`, nameKey: `edificio ${i}`, ...o })
      .returning(),
  )
}

export async function makeSpace(o: Partial<typeof spaces.$inferInsert> & { buildingId: string }) {
  const i = next()
  return one(
    await getDb()
      .insert(spaces)
      .values({
        name: `Aula ${i}`,
        nameKey: `aula ${i}`,
        linkCode: randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(),
        ...o,
      })
      .returning(),
  )
}

export async function makeCategory(
  o: Partial<typeof categories.$inferInsert> & { campusId: string },
) {
  const i = next()
  return one(
    await getDb()
      .insert(categories)
      .values({ name: `Categoría ${i}`, nameKey: `categoria ${i}`, severity: 2, ...o })
      .returning(),
  )
}

/** Builds whatever parent rows are missing (campus, building, space, category, reporter). */
export async function makeReport(o: Partial<typeof reports.$inferInsert> = {}) {
  const campusId = o.campusId ?? (await makeCampus()).id
  const buildingId = o.buildingId ?? (await makeBuilding({ campusId })).id
  const spaceId = o.spaceId ?? (await makeSpace({ buildingId })).id
  const categoryId = o.categoryId ?? (await makeCategory({ campusId })).id
  const reporterId = o.reporterId ?? (await makeAccount()).id
  return one(
    await getDb()
      .insert(reports)
      .values({
        description: 'Fuga de agua',
        priority: 2,
        ...o,
        campusId,
        buildingId,
        spaceId,
        categoryId,
        reporterId,
      })
      .returning(),
  )
}

/** A Viewer backed by a real account (and a role row when campusId + role are given). */
export async function makeViewer(
  opts: { campusId?: string; role?: StaffRole } = {},
): Promise<Viewer> {
  const account = await makeAccount()
  const roles = new Map<string, StaffRole>()
  if (opts.campusId && opts.role) {
    await makeCampusRole({ campusId: opts.campusId, accountId: account.id, role: opts.role })
    roles.set(opts.campusId, opts.role)
  }
  return { accountId: account.id, email: account.email, roles }
}