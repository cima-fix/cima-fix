import { INSTITUTIONAL_DOMAIN, isInstitutionalEmail, normalizeEmail } from '../../../shared/domain/institutional-email.ts'
import { can } from '../../../shared/domain/permissions.ts'
import type { AssignRoleBody } from '../../../shared/schemas/access.ts'
import type { StaffRole } from '../../../shared/types/common.ts'
import type { Viewer } from '../../../shared/types/viewer.ts'
import { withCampusLock, type CampusLockContext } from '../../db/campus-lock.ts'
import { getDb, type Executor } from '../../db/client.ts'
import { ExternalServiceUnavailable } from '../../integrations/errors.ts'
import { getIdentityVerifier, InvalidCredential, type GoogleIdentity } from '../../integrations/google-identity.ts'
import { AppError } from '../../middleware/errors.ts'
import * as repo from './repository.ts'
import { generateSessionToken, hashSessionToken, SESSION_DURATION_MS } from './session-token.ts'

// Access: sign-in, sessions and roles (SDD 7.2 Acceso, 8.1, 8.4, 10.7).

export type MeView = {
  accountId: string
  email: string
  // Only campuses where the account is staff or admin; in every other one it is a reporter
  // (RF-ACCESO-03).
  roles: { campus: { id: string; name: string }; role: StaffRole }[]
}

export type RoleEntry = { accountId: string; email: string; role: StaffRole; hasLoggedIn: boolean }

const identityUnavailable = () =>
  new AppError(503, 'IDENTITY_UNAVAILABLE', 'La verificación de identidad no está disponible. Inténtalo más tarde.')

// ---------------------------------------------------------------------------------------------
// Sign-in and sessions
// ---------------------------------------------------------------------------------------------

async function verifyIdentity(credential: string): Promise<GoogleIdentity> {
  let verifier
  try {
    verifier = getIdentityVerifier()
  } catch (error) {
    // Missing configuration: the same as Google being down for whoever tries to sign in.
    console.error(error)
    throw identityUnavailable()
  }
  try {
    return await verifier.verify(credential)
  } catch (error) {
    if (error instanceof ExternalServiceUnavailable) {
      console.error(error)
      throw identityUnavailable() // RNF-DISPONIBILIDAD-01
    }
    if (error instanceof InvalidCredential) {
      throw new AppError(401, 'INVALID_CREDENTIAL', 'No se pudo verificar tu cuenta de Google. Inténtalo de nuevo.')
    }
    throw error
  }
}

// DD-05: both the `hd` claim and the email domain are required, and the email must be verified
// by Google.
function requireInstitutional(identity: GoogleIdentity): void {
  if (!identity.emailVerified) {
    throw new AppError(401, 'INVALID_CREDENTIAL', 'Tu correo no está verificado por Google.')
  }
  if (identity.hostedDomain !== INSTITUTIONAL_DOMAIN || !isInstitutionalEmail(identity.email)) {
    throw new AppError(
      403,
      'DOMAIN_NOT_ALLOWED',
      `Solo puedes iniciar sesión con una cuenta @${INSTITUTIONAL_DOMAIN}.`,
    )
  }
}

// POST /api/auth/google (RN-02, RF-ACCESO-02, 03, 13). Returns the session token for the cookie;
// the database only keeps its hash.
export async function login(credential: string): Promise<{ token: string; expiresAt: Date; me: MeView }> {
  const identity = await verifyIdentity(credential)
  requireInstitutional(identity)

  const db = getDb()
  // RN-02: stored in lowercase, so the account and its roles are the same whatever letter case
  // Google returns (RF-ACCESO-06). The email is the only personal data stored (RF-ACCESO-13).
  const account = await repo.upsertAccountOnLogin(db, normalizeEmail(identity.email))
  await repo.deleteExpiredSessions(db, account.id)

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  await repo.insertSession(db, account.id, hashSessionToken(token), expiresAt)

  return { token, expiresAt, me: await getMe({ accountId: account.id, email: account.email }) }
}

// POST /api/auth/logout (RF-ACCESO-14)
export async function logout(token: string): Promise<void> {
  await repo.deleteSession(getDb(), hashSessionToken(token))
}

// Session middleware: the viewer of a valid session, with its roles read from the database on
// every request (DD-04), so a role removed applies from the next request.
export async function findViewerBySessionToken(token: string, db: Executor = getDb()): Promise<Viewer | null> {
  const account = await repo.findSessionAccount(db, hashSessionToken(token))
  if (!account) return null
  const roles = await repo.findRolesOfAccount(db, account.accountId)
  return {
    accountId: account.accountId,
    email: account.email,
    roles: new Map(roles.map((row) => [row.campusId, row.role])),
  }
}

// GET /api/me (RF-ACCESO-03, 04)
export async function getMe(viewer: Pick<Viewer, 'accountId' | 'email'>, db: Executor = getDb()): Promise<MeView> {
  const roles = await repo.findRolesOfAccount(db, viewer.accountId)
  return {
    accountId: viewer.accountId,
    email: viewer.email,
    roles: roles.map((row) => ({ campus: { id: row.campusId, name: row.campusName }, role: row.role })),
  }
}

// ---------------------------------------------------------------------------------------------
// Roles (SDD 10.7)
// ---------------------------------------------------------------------------------------------

function toRoleEntry(row: { accountId: string; email: string; role: StaffRole; firstLoginAt: Date | null }): RoleEntry {
  return { accountId: row.accountId, email: row.email, role: row.role, hasLoggedIn: row.firstLoginAt !== null }
}

// RF-ACCESO-05 (RN-01, RN-03): always against the campus of the route.
function requireRoleManager(viewer: Viewer, campusId: string): void {
  if (!can(viewer.roles, 'roles.manage', campusId)) {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para gestionar los roles de este campus.')
  }
}

// RF-ACCESO-09: an account stops being staff (removed, or changed to admin) only without open
// reports assigned in the campus.
async function requireNoOpenAssigned(tx: Executor, campusId: string, accountId: string): Promise<void> {
  if ((await repo.countOpenAssigned(tx, campusId, accountId)) > 0) {
    throw new AppError(
      409,
      'STAFF_HAS_OPEN_REPORTS',
      'La cuenta tiene reportes abiertos asignados en este campus. Reasígnalos antes de cambiar su rol.',
    )
  }
}

// RF-ACCESO-10: checked AFTER applying the change, inside the same transaction, so a single rule
// covers demoting oneself, removing the last admin and replacing it with one that never signed
// in. Throwing rolls the change back.
async function requireLoggedInAdmin(tx: Executor, campusId: string): Promise<void> {
  if (!(await repo.isCampusActive(tx, campusId))) return
  if ((await repo.countLoggedInAdmins(tx, campusId)) === 0) {
    throw new AppError(
      409,
      'LAST_ADMIN',
      'El campus debe conservar al menos un admin que ya haya iniciado sesión.',
    )
  }
}

// GET /api/campuses/:id/roles (RF-ACCESO-11, 12)
export async function listRoles(viewer: Viewer, campusId: string): Promise<RoleEntry[]> {
  if (!can(viewer.roles, 'roles.read', campusId)) {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para consultar los roles de este campus.')
  }
  return (await repo.findRolesInCampus(getDb(), campusId)).map(toRoleEntry)
}

// PUT /api/campuses/:id/roles (RF-ACCESO-04…06, 08…10, RF-NOTIFICACION-04). The email arrives
// already checked against the domain and in lowercase (assignRoleBody, RF-ACCESO-08).
export async function assignRole(viewer: Viewer, campusId: string, body: AssignRoleBody): Promise<RoleEntry> {
  requireRoleManager(viewer, campusId)
  return withCampusLock(campusId, async ({ tx, emit }) => {
    const account = await repo.findOrCreateAccount(tx, body.email)
    const previous = await repo.findRole(tx, campusId, account.id)
    const entry = toRoleEntry({ accountId: account.id, email: account.email, role: body.role, firstLoginAt: account.firstLoginAt })
    if (previous === body.role) return entry // nothing changes, no email

    if (previous === 'staff') await requireNoOpenAssigned(tx, campusId, account.id)
    await repo.upsertRole(tx, { campusId, accountId: account.id, role: body.role, assignedBy: viewer.accountId })
    await requireLoggedInAdmin(tx, campusId)

    emit({ type: 'RoleAssigned', campusId, actorId: viewer.accountId, accountId: account.id, role: body.role })
    return entry
  })
}

// DELETE /api/campuses/:id/roles/:accountId (RF-ACCESO-05, 07, 09, 10). Sends no email (8.4).
export async function removeRole(viewer: Viewer, campusId: string, accountId: string): Promise<void> {
  requireRoleManager(viewer, campusId)
  await withCampusLock(campusId, async ({ tx }) => {
    const previous = await repo.findRole(tx, campusId, accountId)
    if (!previous) throw new AppError(404, 'ROLE_NOT_FOUND', 'La cuenta no tiene un rol en este campus.')

    if (previous === 'staff') await requireNoOpenAssigned(tx, campusId, accountId)
    await repo.deleteRole(tx, campusId, accountId) // RF-ACCESO-07: back to reporter
    await requireLoggedInAdmin(tx, campusId)
  })
}

// Used by `npm run campus:create` (SDD 15.4), inside the transaction that creates the campus: the
// first admin is created in advance and RF-ACCESO-10 is not checked, since that rule applies only
// when roles change. Sends no email.
export async function grantFirstAdmin({ tx }: Pick<CampusLockContext, 'tx'>, campusId: string, email: string): Promise<RoleEntry> {
  if (!isInstitutionalEmail(email)) throw new Error(`The admin email must belong to @${INSTITUTIONAL_DOMAIN}`)
  const account = await repo.findOrCreateAccount(tx, normalizeEmail(email))
  await repo.upsertRole(tx, { campusId, accountId: account.id, role: 'admin', assignedBy: null })
  return toRoleEntry({ accountId: account.id, email: account.email, role: 'admin', firstLoginAt: account.firstLoginAt })
}