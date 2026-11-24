import type { CampusId, Role, StaffRole } from '../types/common'

export type Permission =
  | 'report.create'
  | 'report.read'
  | 'report.readCancelled'
  | 'report.readExpiredResolved'
  | 'report.viewEmails'
  | 'report.cancelOwnUnconfirmed'
  | 'report.assign'
  | 'report.resolveAssigned'
  | 'report.cancelAny'
  | 'catalog.manage'
  | 'roles.read'
  | 'roles.manage'
  | 'alertThresholds.manage'
  | 'mapThresholds.manage'

const EVERY_ROLE: readonly Permission[] = [
  'report.create',
  'report.read',
  'report.cancelOwnUnconfirmed',
]

const MANAGEMENT: readonly Permission[] = [
  'report.readCancelled',
  'report.readExpiredResolved',
  'report.viewEmails',
  'report.assign',
  'report.cancelAny',
  'roles.read',
]

// RN-03: the permission matrix of the SRS, row by row.
const PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  reporter: new Set(EVERY_ROLE),
  staff: new Set([...EVERY_ROLE, ...MANAGEMENT, 'report.resolveAssigned']),
  admin: new Set([
    ...EVERY_ROLE,
    ...MANAGEMENT,
    'catalog.manage',
    'roles.manage',
    'alertThresholds.manage',
    'mapThresholds.manage',
  ]),
}

// Role of an account in each campus where it is not a reporter (SDD 10.3, DD-06).
export type CampusRoles = ReadonlyMap<CampusId, StaffRole>

export function roleIn(roles: CampusRoles, campusId: CampusId): Role {
  return roles.get(campusId) ?? 'reporter' // RF-ACCESO-03
}

// RN-01: always evaluated against the campus of the resource, so a role held in another campus
// grants nothing. Conditions on the resource itself (who registered the report, who it is
// assigned to, how many confirmations it has) are checked in the SQL that performs the action
// (SDD 10.3).
export function can(roles: CampusRoles, permission: Permission, campusId: CampusId): boolean {
  return PERMISSIONS[roleIn(roles, campusId)].has(permission)
}

// Campuses where the account sees closed reports without limit, used by the visibility filter
// of the report queries (SDD 10.4).
export function managedCampusIds(roles: CampusRoles): CampusId[] {
  return [...roles.keys()].filter(
    (campusId) =>
      can(roles, 'report.readCancelled', campusId) &&
      can(roles, 'report.readExpiredResolved', campusId),
  )
}
