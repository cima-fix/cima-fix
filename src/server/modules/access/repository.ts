import { and, asc, count, desc, eq, gt, isNotNull, lte, sql } from 'drizzle-orm'

import type { StaffRole } from '../../../shared/types/common.ts'
import type { Executor } from '../../db/client.ts'
import { accounts, campusRoles, campuses, reports, sessions } from '../../db/schema.ts'

// Queries of the access module. Other modules use access only through service.ts (SDD 5.2).

// Sign-in: creates the account or updates it. `first_login_at` is set only the first time, also
// for an account created in advance when a role was assigned to it (DD-06).
export async function upsertAccountOnLogin(db: Executor, email: string) {
  const [account] = await db
    .insert(accounts)
    .values({ email, firstLoginAt: sql`now()`, lastLoginAt: sql`now()` })
    .onConflictDoUpdate({
      target: accounts.email,
      set: {
        firstLoginAt: sql`coalesce(${accounts.firstLoginAt}, now())`,
        lastLoginAt: sql`now()`,
      },
    })
    .returning({ id: accounts.id, email: accounts.email })
  if (!account) throw new Error('Account upsert returned no row')
  return account
}

// Role assignment to an email that never signed in creates the account in advance (DD-06).
export async function findOrCreateAccount(db: Executor, email: string) {
  await db.insert(accounts).values({ email }).onConflictDoNothing({ target: accounts.email })
  const [account] = await db
    .select({ id: accounts.id, email: accounts.email, firstLoginAt: accounts.firstLoginAt })
    .from(accounts)
    .where(eq(accounts.email, email))
  if (!account) throw new Error('Account not found after insert')
  return account
}

export async function insertSession(db: Executor, accountId: string, tokenHash: string, expiresAt: Date) {
  await db.insert(sessions).values({ accountId, tokenHash, expiresAt })
}

// Expired sessions of the account are removed when it signs in again, so the table does not grow
// without limit.
export async function deleteExpiredSessions(db: Executor, accountId: string) {
  await db.delete(sessions).where(and(eq(sessions.accountId, accountId), lte(sessions.expiresAt, sql`now()`)))
}

export async function deleteSession(db: Executor, tokenHash: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}

// Account of a session that has not expired (RNF-SEGURIDAD-02).
export async function findSessionAccount(db: Executor, tokenHash: string) {
  const [row] = await db
    .select({ accountId: accounts.id, email: accounts.email })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, sql`now()`)))
  return row
}

// Roles of the account in every campus where it is not a reporter (SDD 10.3).
export async function findRolesOfAccount(db: Executor, accountId: string) {
  return db
    .select({ campusId: campusRoles.campusId, campusName: campuses.name, role: campusRoles.role })
    .from(campusRoles)
    .innerJoin(campuses, eq(campuses.id, campusRoles.campusId))
    .where(eq(campusRoles.accountId, accountId))
    .orderBy(asc(campuses.name))
}

// RF-ACCESO-11: every account with a role in the campus, including the ones that never signed in.
export async function findRolesInCampus(db: Executor, campusId: string) {
  return db
    .select({
      accountId: accounts.id,
      email: accounts.email,
      role: campusRoles.role,
      firstLoginAt: accounts.firstLoginAt,
    })
    .from(campusRoles)
    .innerJoin(accounts, eq(accounts.id, campusRoles.accountId))
    .where(eq(campusRoles.campusId, campusId))
    .orderBy(desc(campusRoles.role), asc(accounts.email))
}

export async function findRole(db: Executor, campusId: string, accountId: string) {
  const [row] = await db
    .select({ role: campusRoles.role })
    .from(campusRoles)
    .where(and(eq(campusRoles.campusId, campusId), eq(campusRoles.accountId, accountId)))
  return row?.role
}

// RF-ACCESO-04: one role per account and campus; the new one replaces the previous one.
export async function upsertRole(
  db: Executor,
  values: { campusId: string; accountId: string; role: StaffRole; assignedBy: string | null },
) {
  await db
    .insert(campusRoles)
    .values(values)
    .onConflictDoUpdate({
      target: [campusRoles.campusId, campusRoles.accountId],
      set: { role: values.role, assignedBy: values.assignedBy, assignedAt: sql`now()` },
    })
}

export async function deleteRole(db: Executor, campusId: string, accountId: string) {
  await db.delete(campusRoles).where(and(eq(campusRoles.campusId, campusId), eq(campusRoles.accountId, accountId)))
}

// RF-ACCESO-09: open reports assigned to the account in the campus.
export async function countOpenAssigned(db: Executor, campusId: string, accountId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(reports)
    .where(and(eq(reports.campusId, campusId), eq(reports.assigneeId, accountId), eq(reports.isOpen, true)))
  return row?.total ?? 0
}

// RF-ACCESO-10: admins of the campus that signed in at least once.
export async function countLoggedInAdmins(db: Executor, campusId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(campusRoles)
    .innerJoin(accounts, eq(accounts.id, campusRoles.accountId))
    .where(and(eq(campusRoles.campusId, campusId), eq(campusRoles.role, 'admin'), isNotNull(accounts.firstLoginAt)))
  return row?.total ?? 0
}

export async function isCampusActive(db: Executor, campusId: string) {
  const [row] = await db.select({ isActive: campuses.isActive }).from(campuses).where(eq(campuses.id, campusId))
  return row?.isActive ?? false
}