import { redirect, useRouteLoaderData } from 'react-router'
import { getSession, type Session } from './demo-api'

export const ROLE_LABEL = { staff: 'Encargado', admin: 'Admin' } as const

// SDD 8.1: `next` only takes internal paths that start with "/" and not "//" (or "/\"),
// so signing in can never become an open redirect.
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : '/'
}

// RF-ACCESO-01: every screen but /ingresar needs a session. Without one, go to /ingresar and
// come back to the same address after signing in (RF-REPORTE-11, RF-GESTION-21).
export function requireSession(request: Request): Session {
  const session = getSession()
  if (!session) {
    const url = new URL(request.url)
    throw redirect(`/ingresar?${new URLSearchParams({ next: url.pathname + url.search })}`)
  }
  return session
}

export function shellLoader({ request }: { request: Request }) {
  return { session: requireSession(request) }
}

// Session of the signed-in account, for any screen inside the app shell.
export function useSession() {
  const data = useRouteLoaderData<typeof shellLoader>('shell')
  if (!data) throw new Error('useSession must be used inside the app shell')
  return data.session
}
