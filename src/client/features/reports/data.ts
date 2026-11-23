import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import {
  ApiError,
  assignReport,
  cancelReport,
  getCatalog,
  getReport,
  listReports,
  resolveReport,
} from '../../lib/demo-api'

// React Router loaders/actions for the report screens (SDD 13.1: no global server state).

export async function reportListLoader() {
  const [reports, catalog] = await Promise.all([listReports(), getCatalog()])
  return { reports, catalog }
}

export async function reportDetailLoader({ params }: LoaderFunctionArgs) {
  try {
    const [report, catalog] = await Promise.all([getReport(params.id ?? ''), getCatalog()])
    return { report, staff: catalog.staff }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      throw data(error.message, { status: 404 })
    }
    throw error
  }
}

export type ReportIntent = 'assign' | 'resolve' | 'cancel'

// One action for every change to a report, picked by the submitted `intent`.
export async function reportAction({ request, params }: ActionFunctionArgs) {
  const id = params.id ?? ''
  const form = await request.formData()
  const intent = form.get('intent') as ReportIntent

  switch (intent) {
    case 'assign': {
      await assignReport(id, String(form.get('assignee')))
      return redirect(`/reportes/${id}`)
    }
    case 'resolve':
      await resolveReport(id)
      return null
    case 'cancel':
      await cancelReport(id)
      return null
    default:
      throw data('Acción no válida.', { status: 400 })
  }
}
