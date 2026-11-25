import { sessionCan, type Session } from './session'

export type AdminSection = 'catalogo' | 'personal' | 'configuracion'

// Management screens of a campus (SDD 13.2): /campus/:slug/<section>.
export function adminPath(section: AdminSection, slug: string) {
  return `/campus/${slug}/${section}`
}

// The management screens the account can open in the campus it is looking at (SDD 13.2).
export function adminLinks(session: Session) {
  const slug = session.campus?.slug
  if (!slug) return []
  return [
    { section: 'personal' as const, label: 'Personal', show: sessionCan(session, 'roles.read') },
    { section: 'catalogo' as const, label: 'Catálogo', show: sessionCan(session, 'catalog.manage') },
    {
      section: 'configuracion' as const,
      label: 'Configuración',
      show: sessionCan(session, 'mapThresholds.manage'),
    },
  ]
    .filter((link) => link.show)
    .map((link) => ({ ...link, to: adminPath(link.section, slug) }))
}

// /e/:code sends this flag to /reportar when the space of the link is not offered
// (RF-REPORTE-10).
export const SPACE_UNAVAILABLE_PARAM = 'espacio-no-disponible'
