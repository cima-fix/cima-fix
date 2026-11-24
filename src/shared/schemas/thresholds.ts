import * as z from 'zod'

import { MIN_ALERT_THRESHOLD, MIN_MAP_MEDIUM_THRESHOLD } from '../domain/limits.ts'
import './common.ts'

// Thresholds of a campus. A JSON number is required: text such as "3" is rejected as
// non-numeric, and decimals as non-integer (RF-MAPA-23, 24, RF-NOTIFICACION-15).

// PUT /api/campuses/:id/map-thresholds. Both thresholds are set together, or removed together
// with `null` (RF-MAPA-22).
export const mapThresholdsBody = z
  .strictObject({
    medium: z
      .int({ error: 'El umbral de nivel Medio debe ser un número entero.' })
      .min(MIN_MAP_MEDIUM_THRESHOLD, {
        error: `El umbral de nivel Medio debe ser ${MIN_MAP_MEDIUM_THRESHOLD} o mayor.`,
      }),
    high: z.int({ error: 'El umbral de nivel Alto debe ser un número entero.' }),
  })
  .refine((thresholds) => thresholds.high > thresholds.medium, {
    error: 'El umbral de nivel Alto debe ser mayor que el de nivel Medio.',
    path: ['high'],
  })
  .nullable()

const alertThreshold = z
  .int({ error: 'El umbral debe ser un número entero.' })
  .min(MIN_ALERT_THRESHOLD, { error: `El umbral debe ser ${MIN_ALERT_THRESHOLD} o mayor.` })
  .nullable()

// PUT /api/campuses/:id/alert-thresholds (RF-NOTIFICACION-14). Each one is set or removed with
// `null` on its own.
export const alertThresholdsBody = z.strictObject({
  new: alertThreshold,
  inReview: alertThreshold,
})

export type MapThresholdsBody = z.infer<typeof mapThresholdsBody>
export type AlertThresholdsBody = z.infer<typeof alertThresholdsBody>
