import { data, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import type { Permission } from '../../../shared/domain/permissions.ts'
import { api } from '../../api'
import { ApiError, read, send, withSignIn } from '../../lib/api-errors'
import { PRIORITY_LABEL, type Priority } from '../../lib/reports'
import { loadSession, sessionCan } from '../../lib/session'

// Result of every management action, read by the form that sent it (fetcher.data). The error is
// the API's own message (SDD 7.1, 13.1).
export type ActionResult = { ok: true } | { ok: false; error: string }

// Management screens live under /campus/:slug (SDD 13.2). An unknown campus is a 404; an
// account without the role sees "acceso no permitido" and its data is not loaded. The API
// rejects every action of an account without the role anyway (RN-01, RN-03).
async function guard(
  { request, params }: { request: Request; params: LoaderFunctionArgs['params'] },
  permission: Permission,
) {
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
    if (error instanceof ApiError && error.status !== 401) return { ok: false, error: error.message }
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

// GET /api/campuses/:id/catalog (RF-CATALOGO-16, 20) and the plan of the campus, to place each
// building on it (RF-CATALOGO-13).
export const catalogLoader = withSignIn(async (args: LoaderFunctionArgs) => {
  const { campus, allowed } = await guard(args, 'catalog.manage')
  if (!allowed) return { campus, allowed, catalog: null, plan: null }
  const id = campus.id
  const [catalog, map] = await Promise.all([
    read(api.campuses[':id'].catalog.$get({ param: { id } })),
    read(api.campuses[':id'].map.$get({ param: { id } })),
  ])
  return { campus, allowed, catalog, plan: map.floorPlan }
})

export const catalogAction = withSignIn(async ({ request, params }: ActionFunctionArgs) => {
  const { campus } = await guard({ request, params }, 'catalog.manage')
  const form = await request.formData()
  const param = { id: text(form, 'id') }
  switch (text(form, 'intent')) {
    case 'create-building':
      return run(() =>
        read(api.campuses[':id'].buildings.$post({ param: { id: campus.id }, json: { name: text(form, 'name') } })),
      )
    case 'rename-building':
      return run(() => read(api.buildings[':id'].$patch({ param, json: { name: text(form, 'name') } })))
    case 'toggle-building':
      return run(() =>
        read(api.buildings[':id'].$patch({ param, json: { isActive: form.get('active') === 'true' } })),
      )
    case 'position-building': {
      // RF-CATALOGO-13, 19: plan coordinates, or null to remove the position.
      const position =
        form.get('clear') === 'true' ? null : { x: Number(form.get('x')), y: Number(form.get('y')) }
      return run(() => read(api.buildings[':id'].$patch({ param, json: { position } })))
    }
    case 'create-space':
      return run(() => read(api.buildings[':id'].spaces.$post({ param, json: { name: text(form, 'name') } })))
    case 'rename-space':
      return run(() => read(api.spaces[':id'].$patch({ param, json: { name: text(form, 'name') } })))
    case 'toggle-space':
      return run(() => read(api.spaces[':id'].$patch({ param, json: { isActive: form.get('active') === 'true' } })))
    case 'create-category':
      return run(() =>
        read(
          api.campuses[':id'].categories.$post({
            param: { id: campus.id },
            json: { name: text(form, 'name'), severity: severity(form) },
          }),
        ),
      )
    case 'update-category':
      return run(() =>
        read(api.categories[':id'].$patch({ param, json: { name: text(form, 'name'), severity: severity(form) } })),
      )
    case 'toggle-category':
      return run(() =>
        read(api.categories[':id'].$patch({ param, json: { isActive: form.get('active') === 'true' } })),
      )
    default:
      throw data('Acción no válida.', { status: 400 })
  }
})

/* Personal (RF-ACCESO-05…12) */

export const staffLoader = withSignIn(async (args: LoaderFunctionArgs) => {
  const { session, campus, allowed } = await guard(args, 'roles.read')
  return {
    campus,
    allowed,
    canManage: sessionCan(session, 'roles.manage', campus.id),
    roles: allowed ? await read(api.campuses[':id'].roles.$get({ param: { id: campus.id } })) : [],
  }
})

// PUT /api/campuses/:id/roles and DELETE /api/campuses/:id/roles/:accountId (SDD 8.4).
export const staffAction = withSignIn(async ({ request, params }: ActionFunctionArgs) => {
  const { campus } = await guard({ request, params }, 'roles.manage')
  const form = await request.formData()
  switch (text(form, 'intent')) {
    case 'assign': {
      // The select sends the label ("Encargado", "Admin"); the person buttons send the role.
      const byLabel: Record<string, 'staff' | 'admin'> = { Encargado: 'staff', Admin: 'admin' }
      const role = byLabel[text(form, 'role')] ?? (text(form, 'role') as 'staff' | 'admin')
      return run(() =>
        read(api.campuses[':id'].roles.$put({ param: { id: campus.id }, json: { email: text(form, 'email'), role } })),
      )
    }
    case 'remove':
      return run(() =>
        send(
          api.campuses[':id'].roles[':accountId'].$delete({
            param: { id: campus.id, accountId: text(form, 'accountId') },
          }),
        ),
      )
    default:
      throw data('Acción no válida.', { status: 400 })
  }
})

/* Configuración (RF-NOTIFICACION-13…15, RF-MAPA-21…24) */

// The map thresholds come with the map (GET /api/campuses/:id/map). The API has no way to read
// the alert thresholds yet (SDD 7.2 only defines their PUT), so the screen cannot show them.
export const settingsLoader = withSignIn(async (args: LoaderFunctionArgs) => {
  const { campus, allowed } = await guard(args, 'alertThresholds.manage')
  if (!allowed) return { campus, allowed, mapThresholds: null }
  const map = await read(api.campuses[':id'].map.$get({ param: { id: campus.id } }))
  return { campus, allowed, mapThresholds: map.thresholds }
})

export type SettingsResult = ActionResult & { alert?: { new: number | null; inReview: number | null } }

export const settingsAction = withSignIn(
  async ({ request, params }: ActionFunctionArgs): Promise<SettingsResult> => {
    const { campus } = await guard({ request, params }, 'alertThresholds.manage')
    const param = { id: campus.id }
    const form = await request.formData()
    switch (text(form, 'intent')) {
      case 'alert': {
        try {
          const alert = await read(
            api.campuses[':id']['alert-thresholds'].$put({
              param,
              json: { new: threshold(form, 'new'), inReview: threshold(form, 'inReview') },
            }),
          )
          return { ok: true, alert }
        } catch (error) {
          if (error instanceof ApiError && error.status !== 401) return { ok: false, error: error.message }
          throw error
        }
      }
      case 'map': {
        const medium = threshold(form, 'medium')
        const high = threshold(form, 'high')
        if (medium === null || high === null) {
          return { ok: false, error: 'Indica los dos umbrales, Medio y Alto.' }
        }
        return run(() => read(api.campuses[':id']['map-thresholds'].$put({ param, json: { medium, high } })))
      }
      case 'map-clear':
        return run(() => read(api.campuses[':id']['map-thresholds'].$put({ param, json: null })))
      default:
        throw data('Acción no válida.', { status: 400 })
    }
  },
)
