import type { LoaderFunctionArgs } from 'react-router'
import { api } from '../../api'
import { read, withSignIn } from '../../lib/api-errors'
import { loadSession } from '../../lib/session'

// /reportar — the campuses (RF-GESTION-24) and what the form offers in the chosen one: buildings
// with active spaces and active categories (GET /api/campuses/:id/report-options,
// RF-CATALOGO-10, RF-REPORTE-12). ?campus=<slug> picks the campus; the default one otherwise.
export const reportFormLoader = withSignIn(async ({ request }: LoaderFunctionArgs) => {
  const session = await loadSession(request)
  const slug = new URL(request.url).searchParams.get('campus')
  const campus = session.campuses.find((c) => c.slug === slug) ?? session.campus
  const options = campus
    ? await read(api.campuses[':id']['report-options'].$get({ param: { id: campus.id } }))
    : { buildings: [], categories: [] }
  return { campus, campuses: session.campuses, options }
})
