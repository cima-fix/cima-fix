import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { api } from '../../api'
import { resolveSpaceCode } from '../../lib/demo-api'
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
export const spaceLinkLoader = withSignIn(async ({ request, params }: LoaderFunctionArgs) => {
  await loadSession(request)
  const link = await resolveSpaceCode(params.code ?? '')
  const query = new URLSearchParams()
  if (link.building) query.set('edificio', link.building)
  if (link.space) query.set('espacio', link.space)
  if (link.unavailable) query.set(SPACE_UNAVAILABLE_PARAM, '1')
  throw redirect(`/reportar?${query}`)
})
