import { data, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import type { Permission } from '../../../shared/domain/permissions.ts'
import {
  ApiError,
  assignRole,
  createBuilding,
  createCategory,
  createSpace,
  getManagedCatalog,
  getThresholds,
  listRoles,
  removeRole,
  renameBuilding,
  renameSpace,
  setAlertThresholds,
  setBuildingActive,
  setBuildingPosition,
  setCategoryActive,
  setMapThresholds,
  setSpaceActive,
  updateCategory,
} from '../../lib/demo-api'
import { PRIORITY_LABEL, type Priority } from '../../lib/reports'
import { withSignIn } from '../../lib/api-errors'
import { loadSession, sessionCan } from '../../lib/session'

// Result of every management action, read by the form that sent it (fetcher.data).
export type ActionResult = { ok: true } | { ok: false; error: string }

// Management screens live under /campus/:slug (SDD 13.2). An unknown campus is a 404; an
// account without the role sees "acceso no permitido" and its data is not loaded (SDD 13.2,
// RN-01, RN-03; the API rejects the actions anyway).
async function guard({ request, params }: LoaderFunctionArgs, permission: Permission) {
  const session = await loadSession(request)
  const campus = session.campuses.find((c) => c.slug === params.slug)
  if (!campus) throw data('Este campus no existe.', { status: 404 })
  return { session, campus, allowed: sessionCan(session, permission, campus.id) }
}

async function run(change: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await change()
    return { ok: true }
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message }
    throw error
  }
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '')

// The severity selects send the label ("Baja", "Media", "Alta").
function severity(form: FormData): Priority {
  const label = text(form, 'severity')
  const found = (Object.keys(PRIORITY_LABEL) as Priority[]).find((p) => PRIORITY_LABEL[p] === label)
  return found ?? 'low'
}

// '' is "no threshold"; anything else goes to the API as a number, so "2.5" or "abc" get the
// API's own validation message (RF-MAPA-23, 24, RF-NOTIFICACION-15).
function threshold(form: FormData, key: string) {
  const value = text(form, key).trim()
  return value === '' ? null : Number(value)
}

/* Catálogo (3.3.1) */

export const catalogLoader = withSignIn(async (args: LoaderFunctionArgs) => {
  const { campus, allowed } = await guard(args, 'catalog.manage')
  return { campus, allowed, catalog: allowed ? await getManagedCatalog() : null }
})

export async function catalogAction({ request }: ActionFunctionArgs) {
  const form = await request.formData()
  const id = text(form, 'id')
  switch (text(form, 'intent')) {
    case 'create-building':
      return run(() => createBuilding(text(form, 'name')))
    case 'rename-building':
      return run(() => renameBuilding(id, text(form, 'name')))
    case 'toggle-building':
      return run(() => setBuildingActive(id, form.get('active') === 'true'))
    case 'position-building': {
      const clear = form.get('clear') === 'true'
      const x = Number(form.get('x'))
      const y = Number(form.get('y'))
      return run(() => setBuildingPosition(id, clear ? null : { x, y }))
    }
    case 'create-space':
      return run(() => createSpace(id, text(form, 'name')))
    case 'rename-space':
      return run(() => renameSpace(id, text(form, 'name')))
    case 'toggle-space':
      return run(() => setSpaceActive(id, form.get('active') === 'true'))
    case 'create-category':
      return run(() => createCategory(text(form, 'name'), severity(form)))
    case 'update-category':
      return run(() =>
        updateCategory(id, { name: text(form, 'name'), severity: severity(form) }),
      )
    case 'toggle-category':
      return run(() => setCategoryActive(id, form.get('active') === 'true'))
    default:
      throw data('Acción no válida.', { status: 400 })
  }
}

/* Personal (RF-ACCESO-05…12) */

export const staffLoader = withSignIn(async (args: LoaderFunctionArgs) => {
  const { session, campus, allowed } = await guard(args, 'roles.read')
  return {
    campus,
    allowed,
    canManage: sessionCan(session, 'roles.manage', campus.id),
    roles: allowed ? await listRoles() : [],
  }
})

export async function staffAction({ request }: ActionFunctionArgs) {
  const form = await request.formData()
  switch (text(form, 'intent')) {
    case 'assign': {
      // The select sends the label ("Encargado", "Admin"); the person buttons send the role.
      const role = text(form, 'role')
      const byLabel: Record<string, string> = { Encargado: 'staff', Admin: 'admin' }
      return run(() => assignRole(text(form, 'email'), byLabel[role] ?? role))
    }
    case 'remove':
      return run(() => removeRole(text(form, 'email')))
    default:
      throw data('Acción no válida.', { status: 400 })
  }
}

/* Configuración (RF-NOTIFICACION-13…15, RF-MAPA-21…24) */

export const settingsLoader = withSignIn(async (args: LoaderFunctionArgs) => {
  const { campus, allowed } = await guard(args, 'alertThresholds.manage')
  return { campus, allowed, thresholds: allowed ? await getThresholds() : null }
})

export async function settingsAction({ request }: ActionFunctionArgs) {
  const form = await request.formData()
  switch (text(form, 'intent')) {
    case 'alert':
      return run(() =>
        setAlertThresholds({ new: threshold(form, 'new'), inReview: threshold(form, 'inReview') }),
      )
    case 'map': {
      const medium = threshold(form, 'medium')
      const high = threshold(form, 'high')
      if (medium === null || high === null) {
        return { ok: false, error: 'Indica los dos umbrales, Medio y Alto.' } satisfies ActionResult
      }
      return run(() => setMapThresholds({ medium, high }))
    }
    case 'map-clear':
      return run(() => setMapThresholds(null))
    default:
      throw data('Acción no válida.', { status: 400 })
  }
}
