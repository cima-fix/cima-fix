import { CAMPUS } from './demo-api'

export type AdminSection = 'catalogo' | 'personal' | 'configuracion'

// Management screens of a campus (SDD 13.2): /campus/:slug/<section>.
export function adminPath(section: AdminSection, slug = CAMPUS.slug) {
  return `/campus/${slug}/${section}`
}

// /e/:code sends this flag to /reportar when the space of the link is not offered
// (RF-REPORTE-10).
export const SPACE_UNAVAILABLE_PARAM = 'espacio-no-disponible'
