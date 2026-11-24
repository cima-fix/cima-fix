import * as z from 'zod'

import { isInstitutionalEmail, normalizeEmail } from '../domain/institutional-email.ts'
import { STAFF_ROLES } from '../types/common.ts'
import { id } from './common.ts'

// Input of the access endpoints (SDD 7.2, Acceso).

// POST /api/auth/google: the ID token that Google Identity Services returns (SDD 8.1).
export const googleLoginBody = z.strictObject({
  credential: z.string({ error: 'Falta la credencial de Google.' }).min(1, {
    error: 'Falta la credencial de Google.',
  }),
})

// PUT /api/campuses/:id/roles (RF-ACCESO-06, 08). The email is normalized to lowercase, so the
// role is kept whatever letter case was used (RN-02).
export const assignRoleBody = z.strictObject({
  email: z
    .string({ error: 'El correo es obligatorio.' })
    .refine(isInstitutionalEmail, {
      error: 'El correo debe pertenecer al dominio @uabc.edu.mx.',
      params: { code: 'DOMAIN_NOT_ALLOWED' },
    })
    .transform(normalizeEmail),
  role: z.enum(STAFF_ROLES, { error: 'El rol debe ser Encargado o Admin.' }),
})

// DELETE /api/campuses/:id/roles/:accountId (RF-ACCESO-07)
export const roleParams = z.strictObject({ id, accountId: id })

export type GoogleLoginBody = z.infer<typeof googleLoginBody>
export type AssignRoleBody = z.infer<typeof assignRoleBody>
