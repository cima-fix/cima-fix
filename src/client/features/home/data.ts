import type { LoaderFunctionArgs } from 'react-router'
import { api } from '../../api'
import { read, withSignIn } from '../../lib/api-errors'
import { DESKTOP_QUERY, matchesMedia } from '../../lib/media'
import { compareReports, isOpen, type Report } from '../../lib/reports'
import { loadSession, sessionCan } from '../../lib/session'

type ReportQuery = NonNullable<Parameters<typeof api.reports.$get>[0]>['query']

// Most pages read to count reports: 10 × 20 = 200, more than a campus has open at once.
const MAX_PAGES = 10

// Every report of a query (pages of 20, SDD 7.1), up to MAX_PAGES pages.
export async function readAll(query: ReportQuery): Promise<Report[]> {
  const reports: Report[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await read(api.reports.$get({ query: { ...query, ...(cursor && { cursor }) } }))
    reports.push(...result.reports)
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }
  return reports
}

export type Dashboard = {
  // Staff and admins: what needs attention in the campus. Null for a Reportante.
  counts: { unassigned: number; assignedToMe: number } | null
  // "Lo más urgente para ti": open reports assigned to the account and the new ones (staff), or
  // the account's own open reports (Reportante), most urgent first (RF-GESTION-14).
  urgent: Report[]
}

// / — the counts and the urgent reports only show on desktop (lg), so a phone skips the
// requests. `dashboard` is null when it was skipped; HomePage reloads if the screen grows.
export const homeLoader = withSignIn(async ({ request }: LoaderFunctionArgs) => {
  const session = await loadSession(request)
  const campus = session.campus
  if (!matchesMedia(DESKTOP_QUERY) || !campus) return { dashboard: null as Dashboard | null }

  const campusId = campus.id
  if (!sessionCan(session, 'report.assign', campusId)) {
    const mine = await readAll({ campusId, mine: '1' })
    return { dashboard: { counts: null, urgent: mine.filter(isOpen).slice(0, 4) } as Dashboard | null }
  }

  // Nuevo means not assigned yet (SDD 9.1).
  const [unassigned, assigned] = await Promise.all([
    readAll({ campusId, status: 'new' }),
    readAll({ campusId, assignedToMe: '1' }),
  ])
  const assignedOpen = assigned.filter(isOpen)
  return {
    dashboard: {
      counts: { unassigned: unassigned.length, assignedToMe: assignedOpen.length },
      urgent: [...assignedOpen, ...unassigned].sort(compareReports).slice(0, 4),
    } as Dashboard | null,
  }
})
