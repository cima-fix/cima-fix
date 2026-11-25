import { describe, expect, it } from 'vitest'

import { getDb } from '../../src/server/db/client.ts'
import { accounts, campusRoles, campuses } from '../../src/server/db/schema.ts'
import { createPhotoStorage, type FloorPlan, type PhotoStorage } from '../../src/server/integrations/cloudinary.ts'
import { CampusCreationError, createCampus } from '../../src/server/modules/catalog/create-campus.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeAccount, makeCampus } from '../helpers/factories.ts'

// Cloudinary in memory: records what was uploaded and deleted.
function fakeStorage(plan: FloorPlan = { publicId: 'f/plans/valle-dorado', width: 2400, height: 1600 }) {
  const calls = { uploaded: [] as string[], deleted: [] as string[] }
  const storage: PhotoStorage = {
    ...createPhotoStorage({ cloudName: 'c', apiKey: 'k', apiSecret: 's', folder: 'f' }),
    async uploadFloorPlan(filePath) {
      calls.uploaded.push(filePath)
      return plan
    },
    async deleteUploads(publicIds) {
      calls.deleted.push(...publicIds)
    },
  }
  return { storage, calls }
}

const input = {
  slug: 'valle-dorado',
  name: '  UABC Campus   Valle Dorado ',
  floorPlan: './planos/valle-dorado.png',
  admin: 'Admin@UABC.edu.mx',
}

async function failure(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error('expected the creation to fail')
    },
    (error: Error) => error,
  )
}

describe('campus creation (SDD 15.4)', () => {
  useTestDb()

  it('uploads the plan and creates the active campus with its size', async () => {
    const { storage, calls } = fakeStorage()
    const campus = await createCampus(input, { storage })
    expect(calls.uploaded).toEqual(['./planos/valle-dorado.png'])
    expect(campus).toMatchObject({
      slug: 'valle-dorado',
      name: 'UABC Campus Valle Dorado',
      isActive: true,
      floorPlanPublicId: 'f/plans/valle-dorado',
      floorPlanWidth: 2400,
      floorPlanHeight: 1600,
      mapThresholdMedium: null,
      alertThresholdNew: null,
    })
    expect(await getDb().select().from(campuses)).toHaveLength(1)
  })

  it('DD-06: creates the account of the first admin in advance and gives it the admin role', async () => {
    const { storage } = fakeStorage()
    const campus = await createCampus(input, { storage })
    const [account] = await getDb().select().from(accounts)
    expect(account).toMatchObject({ email: 'admin@uabc.edu.mx', firstLoginAt: null })
    expect(await getDb().select().from(campusRoles)).toEqual([
      expect.objectContaining({ campusId: campus.id, accountId: account!.id, role: 'admin', assignedBy: null }),
    ])
  })

  it('DD-06: reuses the account when the admin already exists, ignoring letter case', async () => {
    const existing = await makeAccount({ email: 'admin@uabc.edu.mx' })
    const { storage } = fakeStorage()
    const campus = await createCampus(input, { storage })
    expect(await getDb().select().from(accounts)).toHaveLength(1)
    expect(await getDb().select().from(campusRoles)).toEqual([
      expect.objectContaining({ campusId: campus.id, accountId: existing.id, role: 'admin' }),
    ])
  })

  it.each([
    [{ slug: 'Valle Dorado' }, 'slug'],
    [{ slug: 'valle--dorado' }, 'slug'],
    [{ name: '   ' }, 'nombre'],
    [{ floorPlan: '' }, 'plano'],
    [{ admin: 'admin@gmail.com' }, 'correo institucional'],
  ])('rejects invalid input %o without uploading anything', async (changed, message) => {
    const { storage, calls } = fakeStorage()
    const error = await failure(createCampus({ ...input, ...changed }, { storage }))
    expect(error).toBeInstanceOf(CampusCreationError)
    expect(error.message).toContain(message)
    expect(calls.uploaded).toEqual([])
  })

  it('rejects a repeated slug before uploading the plan', async () => {
    await makeCampus({ slug: 'valle-dorado' })
    const { storage, calls } = fakeStorage()
    const error = await failure(createCampus(input, { storage }))
    expect(error.message).toContain('Ya existe un campus con el slug "valle-dorado"')
    expect(calls.uploaded).toEqual([])
  })

  it('deletes the uploaded plan when the campus cannot be created', async () => {
    // A plan without size breaks the check of the table, after the upload.
    const { storage, calls } = fakeStorage({ publicId: 'f/plans/broken', width: 0, height: 0 })
    await failure(createCampus(input, { storage }))
    expect(calls.deleted).toEqual(['f/plans/broken'])
    expect(await getDb().select().from(campuses)).toEqual([])
  })
})
