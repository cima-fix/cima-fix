import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router'
import { getSession, resolveSpaceCode, signIn, signOut } from '../../lib/demo-api'
import { SPACE_UNAVAILABLE_PARAM } from '../../lib/routes'
import { requireSession, safeNext } from '../../lib/session'

// /ingresar: an account with a session goes straight to where it was going.
export function signInLoader({ request }: LoaderFunctionArgs) {
  const next = safeNext(new URL(request.url).searchParams.get('next'))
  if (getSession()) throw redirect(next)
  return { next }
}

// Stand-in for the Google button (SDD 8.1): the demo signs in with the chosen role.
export async function signInAction({ request }: ActionFunctionArgs) {
  const form = await request.formData()
  await signIn(form.get('role') === 'admin' ? 'admin' : 'staff')
  return redirect(safeNext(String(form.get('next') ?? '')))
}

// "Cerrar sesión" in the side menu.
export async function signOutAction() {
  await signOut()
  return redirect('/ingresar')
}

// /e/:code — link of a space (SDD 10.9). Resolves the code and opens the form with what can
// be preselected; without a session it goes through /ingresar first (RF-REPORTE-11).
export async function spaceLinkLoader({ request, params }: LoaderFunctionArgs) {
  requireSession(request)
  const link = await resolveSpaceCode(params.code ?? '')
  const query = new URLSearchParams()
  if (link.building) query.set('edificio', link.building)
  if (link.space) query.set('espacio', link.space)
  if (link.unavailable) query.set(SPACE_UNAVAILABLE_PARAM, '1')
  throw redirect(`/reportar?${query}`)
}
