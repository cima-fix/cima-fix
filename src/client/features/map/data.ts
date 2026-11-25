import { data, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from 'react-router'
import { api } from '../../api'
import { ApiError, read, withSignIn } from '../../lib/api-errors'
import type { Report } from '../../lib/reports'
import { loadSession, type Session } from '../../lib/session'

// Campus of the map: ?campus=<slug> or the default one (SDD 13.4, RF-MAPA-02, 03).
function campusOf(session: Session, request: Request) {
  const slug = new URL(request.url).searchParams.get('campus')
  const campus = session.campuses.find((c) => c.slug === slug) ?? session.campus
  if (!campus) throw data('No hay campus activos.', { status: 404 })
  return campus
}

// /mapa — GET /api/campuses/:id/map. Data is loaded when the route opens, on reload or on a new
// campus; never in the background (RF-MAPA-20).
export const mapLoader = withSignIn(async ({ request }: LoaderFunctionArgs) => {
  const session = await loadSession(request)
  const campus = campusOf(session, request)
  const map = await read(api.campuses[':id'].map.$get({ param: { id: campus.id } }))
  return { campus, campuses: session.campuses, map }
})

// RF-MAPA-19: opening a building and coming back reuses the loaded map; only another campus
// (or a reload) loads it again.
export function shouldRevalidateMap({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname.startsWith('/mapa') && nextUrl.pathname.startsWith('/mapa')) {
    return currentUrl.searchParams.get('campus') !== nextUrl.searchParams.get('campus')
  }
  return defaultShouldRevalidate
}

// Most pages read for one building: 5 × 20 = 100 open reports.
const MAX_PAGES = 5

// /mapa/edificios/:buildingId — GET /api/campuses/:id/buildings/:bid/open-reports, in the
// order of the consultation (RF-MAPA-16…18).
export const buildingReportsLoader = withSignIn(async ({ request, params }: LoaderFunctionArgs) => {
  const session = await loadSession(request)
  const campus = campusOf(session, request)
  const reports: Report[] = []
  let cursor: string | undefined
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      // The route reads ?cursor without declaring it (SDD 7.1), so the client adds it by hand.
      const next = cursor
      const result = await read(
        api.campuses[':id'].buildings[':bid']['open-reports'].$get(
          { param: { id: campus.id, bid: params.buildingId ?? '' } },
          {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
              const url = new URL(String(input), window.location.origin)
              if (next) url.searchParams.set('cursor', next)
              return fetch(url, init)
            },
          },
        ),
      )
      reports.push(...result.reports)
      if (!result.nextCursor) break
      cursor = result.nextCursor
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw data(error.message, { status: 404 })
    throw error
  }
  return { buildingId: params.buildingId ?? '', reports }
})
