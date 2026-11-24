import * as z from 'zod'

import { id } from './common'

// POST /api/reports/:id/confirmations: the campus, category and building of the draft, to check
// that the confirmed report is a possible duplicate of it (RN-05, RF-DUPLICADO-06).
export const confirmationBody = z.strictObject({
  campusId: id,
  categoryId: id,
  buildingId: id,
})

export type ConfirmationBody = z.infer<typeof confirmationBody>
