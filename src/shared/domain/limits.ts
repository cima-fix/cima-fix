// Limits set by the SRS. Every check of these values reads them from here.

// RF-REPORTE-02
export const MAX_DESCRIPTION_LENGTH = 1000

// RF-REPORTE-03
export const MAX_PHOTOS = 3

// RF-REPORTE-04: 10 MB, counted as 10 × 1024 × 1024 bytes.
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

// RF-REPORTE-09, as the format names Cloudinary reports after an upload (SDD 10.10).
export const PHOTO_FORMATS = ['jpg', 'png', 'webp', 'heic'] as const
export type PhotoFormat = (typeof PHOTO_FORMATS)[number]

// SDD 6.2: catalog names have 1 to 100 characters once cleaned.
export const MAX_NAME_LENGTH = 100

// RNF-SEGURIDAD-03
export const MAX_REPORTS_PER_HOUR = 10

// RF-MAPA-23
export const MIN_MAP_MEDIUM_THRESHOLD = 2

// RF-NOTIFICACION-15
export const MIN_ALERT_THRESHOLD = 1

// Length as PostgreSQL counts it for text and varchar: in code points, not UTF-16 units
// (SDD 10.8).
export function textLength(text: string): number {
  return [...text].length
}
