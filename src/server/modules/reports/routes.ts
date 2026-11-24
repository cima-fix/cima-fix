import { Hono } from 'hono'

import { checkReportBody, createReportBody } from '../../../shared/schemas/reports.ts'
import { getPhotoStorage } from '../../integrations/cloudinary.ts'
import { AppError, errorBody } from '../../middleware/errors.ts'
import { validate } from '../../middleware/validate.ts'
import { requireViewer } from '../../middleware/viewer.ts'
import type { AppEnv } from '../../types.ts'
import { checkDraft, registerReport } from './registration.ts'

// Registration endpoints (SDD 7.2, Reportes y duplicados, and 8.2). Paths are relative to /api.
export const reportRoutes = new Hono<AppEnv>()
  .post('/reports/check', validate('json', checkReportBody), async (c) => {
    return c.json(await checkDraft(requireViewer(c), c.req.valid('json')))
  })
  .post('/photos/upload-signature', (c) => {
    requireViewer(c)
    let storage
    try {
      storage = getPhotoStorage()
    } catch (error) {
      console.error(error)
      throw new AppError(
        503,
        'PHOTO_STORAGE_UNAVAILABLE',
        'No se pueden subir fotografías en este momento. Inténtalo más tarde.',
      )
    }
    return c.json(storage.signUpload(new Date()))
  })
  .post('/reports', validate('json', createReportBody), async (c) => {
    const result = await registerReport(requireViewer(c), c.req.valid('json'))
    switch (result.kind) {
      case 'registered':
        return c.json(result.report, 201)
      case 'repeated':
        return c.json(result.report, 200)
      case 'new_duplicates':
        return c.json(
          {
            ...errorBody(
              'NEW_DUPLICATES',
              'Hay reportes nuevos que podrían ser el mismo problema. Revísalos antes de enviar.',
            ),
            duplicates: result.duplicates,
          },
          409,
        )
    }
  })
