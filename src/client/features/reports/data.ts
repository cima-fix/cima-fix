import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { REPORT_STATUSES } from '../../../shared/types/common.ts'
import { api } from '../../api'
import { ApiError, read, send, withSignIn } from '../../lib/api-errors'
import type { ReportStatus } from '../../lib/reports'
import { loadSession } from '../../lib/session'

// React Router loaders/actions for the report screens (SDD 13.1: no global server state).

// Filters of the list, kept in the URL so they survive a reload and can be linked.
export const FILTERS = {
  campus: 'campus',
  category: 'categoria',
  building: 'edificio',
  status: 'estado',
  mine: 'mios',
  assigned: 'asignados',
} as const

const isStatus = (value: string | null): value is ReportStatus =>
  REPORT_STATUSES.includes(value as ReportStatus)

// GET /api/reports (RF-GESTION-03, 04, 14…16, 22…24). One page of 20, in the order of the API;
// `cursor` loads the next one ("Ver más").
export const reportListLoader = withSignIn(async ({ request }: LoaderFunctionArgs) => {
  const session = await loadSession(request)
  const params = new URL(request.url).searchParams
  const campus =
    session.campuses.find((c) => c.slug === params.get(FILTERS.campus)) ?? session.campus
  const status = params.get(FILTERS.status)
  const query = {
    ...(campus && { campusId: campus.id }),
    // Category and building only exist within a campus (RF-GESTION-04).
    ...(campus && params.get(FILTERS.category) && { categoryId: params.get(FILTERS.category)! }),
    ...(campus && params.get(FILTERS.building) && { buildingId: params.get(FILTERS.building)! }),
    ...(isStatus(status) && { status }),
    ...(params.has(FILTERS.mine) && { mine: '1' as const }),
    ...(params.has(FILTERS.assigned) && { assignedToMe: '1' as const }),
    ...(params.get('cursor') && { cursor: params.get('cursor')! }),
  }
  const [page, options] = await Promise.all([
    read(api.reports.$get({ query })),
    campus ? read(api.campuses[':id']['filter-options'].$get({ param: { id: campus.id } })) : null,
  ])
  return { campus, options, page }
})

// Accounts a report of the campus can be assigned to: its Encargados (RF-GESTION-06).
async function staffOf(campusId: string) {
  const roles = await read(api.campuses[':id'].roles.$get({ param: { id: campusId } }))
  return roles.filter((r) => r.role === 'staff').map(({ accountId, email }) => ({ accountId, email }))
}

// GET /api/reports/:id (RF-GESTION-02, 05, 18…21). A report that does not exist and one the
// account cannot see get the same notice (RF-GESTION-19), with the API's message.
export const reportDetailLoader = withSignIn(async ({ request, params }: LoaderFunctionArgs) => {
  await loadSession(request)
  try {
    const report = await read(api.reports[':id'].$get({ param: { id: params.id ?? '' } }))
    const staff = report.allowedActions.includes('assign') ? await staffOf(report.campus.id) : []
    return { report, staff }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw data(error.message, { status: 404 })
    }
    throw error
  }
})

export type ReportIntent = 'assign' | 'resolve' | 'cancel'

// Error of the last action, with the API's message. `conflict` is a 409: someone changed the
// report in the meantime (SDD 8.3), and the page shows it with the data reloaded.
export type ReportActionResult = { error: string; conflict: boolean } | null

// One action for every change to a report, picked by the submitted `intent`. The API checks
// again whether the account may do it (SDD 11).
export const reportAction = withSignIn(
  async ({ request, params }: ActionFunctionArgs): Promise<ReportActionResult | Response> => {
    const id = params.id ?? ''
    const form = await request.formData()
    const intent = form.get('intent') as ReportIntent
    try {
      switch (intent) {
        case 'assign':
          await read(
            api.reports[':id'].assignment.$post({
              param: { id },
              json: { assigneeId: String(form.get('assigneeId')) },
            }),
          )
          return redirect(`/reportes/${id}`)
        case 'resolve':
          await read(api.reports[':id'].resolution.$post({ param: { id } }))
          return null
        case 'cancel':
          await send(api.reports[':id'].cancellation.$post({ param: { id } }))
          // A Reportante no longer sees a Cancelado report (RN-06): back to the list.
          try {
            await read(api.reports[':id'].$get({ param: { id } }))
          } catch {
            return redirect('/reportes')
          }
          return null
        default:
          throw data('Acción no válida.', { status: 400 })
      }
    } catch (error) {
      if (error instanceof ApiError && error.status !== 401) {
        return { error: error.message, conflict: error.status === 409 }
      }
      throw error
    }
  },
)
