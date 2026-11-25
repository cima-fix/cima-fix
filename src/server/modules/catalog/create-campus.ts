import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { isInstitutionalEmail, normalizeEmail } from '../../../shared/domain/institutional-email.ts'
import { cleanName } from '../../../shared/domain/names.ts'
import { getDb, type Executor } from '../../db/client.ts'
import { campuses } from '../../db/schema.ts'
import { getPhotoStorage, type PhotoStorage } from '../../integrations/cloudinary.ts'
import { grantFirstAdmin } from '../access/service.ts'

// Creation of a campus and its first admin, outside the application (SDD 15.4, SRS 1.2). It is
// run by the development team with `npm run campus:create`.

export const createCampusInput = z.strictObject({
  // Used in the routes of the SPA (`/mapa?campus=sauzal`), so only lowercase words and hyphens.
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: 'El slug solo puede tener minúsculas, números y guiones entre palabras.',
  }),
  name: z
    .string()
    .transform(cleanName)
    .refine((name) => name.length > 0, { error: 'El nombre no puede estar vacío.' }),
  floorPlan: z.string().min(1, { error: 'Falta la ruta de la imagen del plano.' }),
  admin: z
    .string()
    .transform(normalizeEmail)
    .refine(isInstitutionalEmail, { error: 'El admin debe tener un correo institucional.' }),
})

export type CreateCampusInput = z.input<typeof createCampusInput>
export type CreatedCampus = typeof campuses.$inferSelect

export class CampusCreationError extends Error {}

export async function createCampus(
  input: CreateCampusInput,
  deps: { db?: Executor; storage?: PhotoStorage } = {},
): Promise<CreatedCampus> {
  const parsed = createCampusInput.safeParse(input)
  if (!parsed.success) {
    throw new CampusCreationError(parsed.error.issues.map((issue) => issue.message).join('\n'))
  }
  const { slug, name, floorPlan } = parsed.data
  const db = deps.db ?? getDb()
  const storage = deps.storage ?? getPhotoStorage()

  // Checked before uploading, so a repeated slug does not leave a plan behind.
  const [existing] = await db.select({ id: campuses.id }).from(campuses).where(eq(campuses.slug, slug))
  if (existing) throw new CampusCreationError(`Ya existe un campus con el slug "${slug}".`)

  const plan = await storage.uploadFloorPlan(floorPlan)
  try {
    return await db.transaction(async (tx) => {
      const [campus] = await tx
        .insert(campuses)
        .values({
          slug,
          name,
          floorPlanPublicId: plan.publicId,
          floorPlanWidth: plan.width,
          floorPlanHeight: plan.height,
        })
        .returning()
      // DD-06: the account of the first admin is created in advance, in the same transaction.
      await grantFirstAdmin({ tx }, campus!.id, parsed.data.admin)
      return campus!
    })
  } catch (error) {
    // The campus was not created, so its plan is not kept. If deleting it fails too, the orphan
    // photo task removes it a day later.
    await storage.deleteUploads([plan.publicId]).catch(() => {})
    throw error
  }
}
