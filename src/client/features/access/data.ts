import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { api } from '../../api'
import { ApiError, read, safeNext, send, withSignIn } from '../../lib/api-errors'
import { SPACE_UNAVAILABLE_PARAM } from '../../lib/routes'
import { loadSession } from '../../lib/session'

// /ingresar: an account that already has a session goes straight to where it was going.
export async function signInLoader({ request }: LoaderFunctionArgs) {
  const next = safeNext(new URL(request.url).searchParams.get('next'))
  try {
    await read(api.me.$get())
  } catch {
    // 401 (no session) or the API is unreachable: show the sign-in screen.
    return { next }
  }
  throw redirect(next)
}

export type SignInResult = { error: { code: string; message: string } }

// POST /api/auth/google with the credential of the GIS button (SDD 8.1).
export async function signInAction({ request }: ActionFunctionArgs): Promise<SignInResult | Response> {
  const form = await request.formData()
  try {
    await read(api.auth.google.$post({ json: { credential: String(form.get('credential') ?? '') } }))
  } catch (error) {
    // DOMAIN_NOT_ALLOWED (RF-ACCESO-02), IDENTITY_UNAVAILABLE (RNF-DISPONIBILIDAD-01), …
    if (error instanceof ApiError) return { error: { code: error.code, message: error.message } }
    throw error
  }
  return redirect(safeNext(String(form.get('next') ?? '')))
}

// "Cerrar sesión" (RF-ACCESO-14). A session that already expired ends the same way.
export async function signOutAction() {
  try {
    await send(api.auth.logout.$post())
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error
  }
  return redirect('/ingresar')
}

// /e/:code — link of a space (SDD 10.9). Resolves the code and opens the form with what can
// be preselected; without a session it goes through /ingresar first (RF-REPORTE-11).
// GET /api/spaces/link/:code answers what to preselect and whether to show the notice (SDD
// 10.9); a code that is not even well formed is just a space that is not available.
export const spaceLinkLoader = withSignIn(async ({ request, params }: LoaderFunctionArgs) => {
  const session = await loadSession(request)
  let link: { preselect: { campusId?: string; buildingId?: string; spaceId?: string }; unavailable: boolean }
  try {
    link = await read(api.spaces.link[':code'].$get({ param: { code: params.code ?? '' } }))
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 400)) throw error
    link = { preselect: {}, unavailable: true }
  }
  const query = new URLSearchParams()
  const campus = session.campuses.find((c) => c.id === link.preselect.campusId)
  if (campus) query.set('campus', campus.slug)
  if (link.preselect.buildingId) query.set('edificio', link.preselect.buildingId)
  if (link.preselect.spaceId) query.set('espacio', link.preselect.spaceId)
  if (link.unavailable) query.set(SPACE_UNAVAILABLE_PARAM, '1')
  throw redirect(`/reportar?${query}`)
})
