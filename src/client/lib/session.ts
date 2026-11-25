import type { InferResponseType } from 'hono/client'
import { useRouteLoaderData } from 'react-router'
import { can, roleIn, type CampusRoles, type Permission } from '../../shared/domain/permissions.ts'
import type { Role } from '../../shared/types/common.ts'
import { api } from '../api'
import { read, withSignIn } from './api-errors'

export type Me = InferResponseType<typeof api.me.$get, 200>
export type Campus = InferResponseType<typeof api.campuses.$get, 200>[number]

export type Session = {
  accountId: string
  email: string
  roles: CampusRoles
  // Active campuses (RF-GESTION-24, RF-MAPA-04) and the one the screens start with.
  campuses: Campus[]
  campus: Campus | undefined
}

export const ROLE_LABEL: Record<Role, string> = {
  reporter: 'Reportante',
  staff: 'Encargado',
  admin: 'Admin',
}

// Campus the screens start with: DEFAULT_CAMPUS_SLUG (SDD 13.4, 15.2), or the first active one.
export function defaultCampus(campuses: Campus[]) {
  const slug = import.meta.env.DEFAULT_CAMPUS_SLUG as string | undefined
  return campuses.find((c) => c.slug === slug) ?? campuses[0]
}

// GET /api/me and GET /api/campuses, once per navigation: every loader of a navigation receives
// the same Request, so the shell and the screen share one pair of requests.
const pending = new WeakMap<Request, Promise<Session>>()

export function loadSession(request: Request): Promise<Session> {
  let session = pending.get(request)
  if (!session) {
    session = Promise.all([read(api.me.$get()), read(api.campuses.$get())]).then(([me, campuses]) => ({
      accountId: me.accountId,
      email: me.email,
      roles: new Map(me.roles.map((r) => [r.campus.id, r.role])),
      campuses,
      campus: defaultCampus(campuses),
    }))
    pending.set(request, session)
  }
  return session
}

// RF-ACCESO-01: every screen but /ingresar needs a session; without one it goes to /ingresar.
export const shellLoader = withSignIn(({ request }: { request: Request }) => loadSession(request))

// Role of the account in a campus (RF-ACCESO-03: no row means Reportante).
export function sessionRole(session: Session, campusId = session.campus?.id): Role {
  return campusId ? roleIn(session.roles, campusId) : 'reporter'
}

// RN-01/RN-03 with the shared permission matrix. It only decides what the SPA shows: the API
// checks every action again (SDD 11).
export function sessionCan(session: Session, permission: Permission, campusId = session.campus?.id) {
  return campusId ? can(session.roles, permission, campusId) : false
}

// Session of the signed-in account, for any screen inside the app shell.
export function useSession() {
  const session = useRouteLoaderData<typeof shellLoader>('shell')
  if (!session) throw new Error('useSession must be used inside the app shell')
  return session
}
