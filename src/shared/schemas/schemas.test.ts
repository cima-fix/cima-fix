import { describe, expect, it } from 'vitest'
import type * as z from 'zod'

import { MAX_PHOTO_BYTES } from '../domain/limits.ts'
import { assignRoleBody } from './access.ts'
import { createCategoryBody, createBuildingBody, updateBuildingBody } from './catalog.ts'
import { confirmationBody } from './duplicates.ts'
import { reportQuery } from './management.ts'
import { checkReportBody, createReportBody } from './reports.ts'
import { alertThresholdsBody, mapThresholdsBody } from './thresholds.ts'

const ID = '7f1d3c2a-9b4e-4c6d-8a1f-2e3b4c5d6e7f'

const draft = {
  campusId: ID,
  buildingId: ID,
  spaceId: ID,
  categoryId: ID,
  description: 'No enciende la lámpara.',
  photoCount: 0,
}

const photo = { publicId: 'cima-fix/abc', version: 1, signature: 'f0', format: 'jpg', bytes: 1000 }

const report = {
  id: ID,
  campusId: ID,
  buildingId: ID,
  spaceId: ID,
  categoryId: ID,
  description: 'No enciende la lámpara.',
  photos: [],
  reviewedDuplicateIds: [],
}

function issues(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input)
  return result.success ? [] : result.error.issues
}

describe('report schemas', () => {
  it('RF-REPORTE-01: requires campus, building, space and category', () => {
    for (const field of ['campusId', 'buildingId', 'spaceId', 'categoryId']) {
      const input: Record<string, unknown> = { ...draft }
      delete input[field]
      expect(checkReportBody.safeParse(input).success).toBe(false)
    }
  })

  it('RF-REPORTE-01: rejects an empty or whitespace-only description', () => {
    expect(issues(checkReportBody, { ...draft, description: '' })[0]?.path).toEqual(['description'])
    expect(checkReportBody.safeParse({ ...draft, description: ' \n\t ' }).success).toBe(false)
  })

  it('RF-REPORTE-02: accepts 1,000 characters and rejects 1,001', () => {
    expect(checkReportBody.safeParse({ ...draft, description: 'a'.repeat(1000) }).success).toBe(true)
    const tooLong = issues(checkReportBody, { ...draft, description: 'a'.repeat(1001) })
    expect(tooLong[0]).toMatchObject({
      path: ['description'],
      message: 'La descripción no puede exceder 1,000 caracteres.',
      params: { code: 'DESCRIPTION_TOO_LONG' },
    })
  })

  it('RF-REPORTE-02: counts characters, not UTF-16 units', () => {
    // Each emoji is two UTF-16 units but one character, as PostgreSQL counts it.
    expect(checkReportBody.safeParse({ ...draft, description: '🔥'.repeat(1000) }).success).toBe(true)
  })

  it('stores the description trimmed', () => {
    expect(checkReportBody.parse({ ...draft, description: '  Fuga  ' }).description).toBe('Fuga')
  })

  it('RF-REPORTE-03: accepts 3 photos and rejects a fourth', () => {
    expect(checkReportBody.safeParse({ ...draft, photoCount: 3 }).success).toBe(true)
    expect(checkReportBody.safeParse({ ...draft, photoCount: 4 }).success).toBe(false)
    const photos = [1, 2, 3, 4].map((n) => ({ ...photo, publicId: `cima-fix/${n}` }))
    expect(createReportBody.safeParse({ ...report, photos: photos.slice(0, 3) }).success).toBe(true)
    expect(createReportBody.safeParse({ ...report, photos }).success).toBe(false)
  })

  it('RF-REPORTE-04: accepts a photo of 10 MB and rejects a larger one', () => {
    const ok = { ...report, photos: [{ ...photo, bytes: MAX_PHOTO_BYTES }] }
    const big = { ...report, photos: [{ ...photo, bytes: MAX_PHOTO_BYTES + 1 }] }
    expect(createReportBody.safeParse(ok).success).toBe(true)
    expect(createReportBody.safeParse(big).success).toBe(false)
  })

  it('RF-REPORTE-09: accepts JPEG, PNG, WebP and HEIC only', () => {
    for (const format of ['jpg', 'png', 'webp', 'heic']) {
      expect(createReportBody.safeParse({ ...report, photos: [{ ...photo, format }] }).success).toBe(true)
    }
    for (const format of ['gif', 'bmp', 'pdf']) {
      expect(createReportBody.safeParse({ ...report, photos: [{ ...photo, format }] }).success).toBe(false)
    }
  })

  it('rejects the same photo attached twice', () => {
    expect(createReportBody.safeParse({ ...report, photos: [photo, photo] }).success).toBe(false)
  })

  it('RF-PRIORIDAD-03, RF-REPORTE-07: rejects a priority or a reporter sent by the client', () => {
    expect(issues(createReportBody, { ...report, priority: 'high' })[0]?.code).toBe('unrecognized_keys')
    expect(createReportBody.safeParse({ ...report, reporterEmail: 'x@uabc.edu.mx' }).success).toBe(false)
  })

  it('RF-DUPLICADO-06: the confirmation carries the campus, category and building of the draft', () => {
    expect(confirmationBody.safeParse({ campusId: ID, categoryId: ID, buildingId: ID }).success).toBe(true)
    expect(confirmationBody.safeParse({ campusId: ID, categoryId: ID }).success).toBe(false)
  })
})

describe('catalog schemas', () => {
  it('stores names cleaned and rejects empty or too long ones', () => {
    expect(createBuildingBody.parse({ name: '  Edificio   5 ' }).name).toBe('Edificio 5')
    expect(createBuildingBody.safeParse({ name: '   ' }).success).toBe(false)
    expect(createBuildingBody.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
    expect(createBuildingBody.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })

  it('RF-CATALOGO-18: requires the severity of a new category', () => {
    expect(createCategoryBody.safeParse({ name: 'Limpieza' }).success).toBe(false)
    expect(createCategoryBody.safeParse({ name: 'Limpieza', severity: 'low' }).success).toBe(true)
    expect(createCategoryBody.safeParse({ name: 'Limpieza', severity: 'urgent' }).success).toBe(false)
  })

  it('RF-CATALOGO-19: a null position removes it', () => {
    expect(updateBuildingBody.parse({ position: null })).toEqual({ position: null })
    expect(updateBuildingBody.safeParse({ position: { x: 10, y: 20 } }).success).toBe(true)
    expect(updateBuildingBody.safeParse({ position: { x: -1, y: 20 } }).success).toBe(false)
  })

  it('rejects an update without any change', () => {
    expect(updateBuildingBody.safeParse({}).success).toBe(false)
  })
})

describe('threshold schemas', () => {
  it('RF-MAPA-23: the medium threshold is an integer of 2 or more', () => {
    expect(mapThresholdsBody.safeParse({ medium: 2, high: 3 }).success).toBe(true)
    for (const medium of [1, 0, -3, 2.5, '3']) {
      expect(mapThresholdsBody.safeParse({ medium, high: 10 }).success).toBe(false)
    }
  })

  it('RF-MAPA-24: with medium 3, high accepts 4 and rejects 3, 2, decimals and text', () => {
    expect(mapThresholdsBody.safeParse({ medium: 3, high: 4 }).success).toBe(true)
    for (const high of [3, 2, 4.5, '4']) {
      expect(mapThresholdsBody.safeParse({ medium: 3, high }).success).toBe(false)
    }
  })

  it('RF-MAPA-22: both map thresholds are removed together with null', () => {
    expect(mapThresholdsBody.parse(null)).toBeNull()
    expect(mapThresholdsBody.safeParse({ medium: 3 }).success).toBe(false)
  })

  it('RF-NOTIFICACION-15: an alert threshold is an integer of 1 or more, or null', () => {
    expect(alertThresholdsBody.safeParse({ new: 1, inReview: null }).success).toBe(true)
    for (const value of [0, -1, 1.5, '2']) {
      expect(alertThresholdsBody.safeParse({ new: value, inReview: null }).success).toBe(false)
    }
  })
})

describe('access schemas', () => {
  it('RF-ACCESO-08: rejects assigning a role to an email of another domain', () => {
    const result = assignRoleBody.safeParse({ email: 'alguien@gmail.com', role: 'staff' })
    expect(result.success).toBe(false)
  })

  it('RF-ACCESO-06: normalizes the email so letter case does not matter', () => {
    expect(assignRoleBody.parse({ email: 'Nombre@UABC.edu.mx', role: 'admin' }).email).toBe(
      'nombre@uabc.edu.mx',
    )
  })

  it('RF-ACCESO-06: only the staff and admin roles can be assigned', () => {
    expect(assignRoleBody.safeParse({ email: 'a@uabc.edu.mx', role: 'reporter' }).success).toBe(false)
  })
})

describe('report query', () => {
  it('RF-GESTION-04: rejects category or building filters without a campus', () => {
    expect(reportQuery.safeParse({ categoryId: ID }).success).toBe(false)
    expect(reportQuery.safeParse({ buildingId: ID }).success).toBe(false)
    expect(reportQuery.safeParse({ campusId: ID, categoryId: ID, buildingId: ID }).success).toBe(true)
  })

  it('RF-GESTION-15, 22: the flags are off unless set to 1', () => {
    expect(reportQuery.parse({})).toMatchObject({ mine: false, assignedToMe: false })
    expect(reportQuery.parse({ mine: '1', assignedToMe: '1' })).toMatchObject({
      mine: true,
      assignedToMe: true,
    })
    expect(reportQuery.safeParse({ mine: 'true' }).success).toBe(false)
  })
})
