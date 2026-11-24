import { describe, expect, it } from 'vitest'

import type { Role, StaffRole } from '../types/common'
import { can, managedCampusIds, roleIn, type CampusRoles, type Permission } from './permissions'

const CAMPUS = 'campus-a'
const OTHER_CAMPUS = 'campus-b'

function rolesWith(role: Role): CampusRoles {
  return role === 'reporter' ? new Map() : new Map<string, StaffRole>([[CAMPUS, role]])
}

// RN-03: the permission matrix of the SRS, with the expected answer for reporter, staff and
// admin in that order.
const MATRIX: [Permission, boolean, boolean, boolean][] = [
  ['report.create', true, true, true],
  ['report.read', true, true, true],
  ['report.readCancelled', false, true, true],
  ['report.readExpiredResolved', false, true, true],
  ['report.viewEmails', false, true, true],
  ['report.cancelOwnUnconfirmed', true, true, true],
  ['report.assign', false, true, true],
  ['report.resolveAssigned', false, true, false],
  ['report.cancelAny', false, true, true],
  ['catalog.manage', false, false, true],
  ['roles.read', false, true, true],
  ['roles.manage', false, false, true],
  ['alertThresholds.manage', false, false, true],
  ['mapThresholds.manage', false, false, true],
]

describe('can', () => {
  it.each(MATRIX)('RN-03: %s is reporter %s, staff %s, admin %s', (permission, ...expected) => {
    const roles: Role[] = ['reporter', 'staff', 'admin']
    expect(roles.map((role) => can(rolesWith(role), permission, CAMPUS))).toEqual(expected)
  })

  it('RN-01: a role in one campus grants nothing in another', () => {
    for (const role of ['staff', 'admin'] as const) {
      for (const [permission, asReporter] of MATRIX) {
        expect(can(rolesWith(role), permission, OTHER_CAMPUS)).toBe(asReporter)
      }
    }
  })

  it('RF-ACCESO-03: an account without a role in a campus is a reporter there', () => {
    expect(roleIn(new Map(), CAMPUS)).toBe('reporter')
  })

  it('RF-ACCESO-04: each campus keeps its own role', () => {
    const roles: CampusRoles = new Map<string, StaffRole>([
      [CAMPUS, 'admin'],
      [OTHER_CAMPUS, 'staff'],
    ])
    expect(roleIn(roles, CAMPUS)).toBe('admin')
    expect(roleIn(roles, OTHER_CAMPUS)).toBe('staff')
  })
})

describe('managedCampusIds', () => {
  it('lists the campuses where the account is staff or admin', () => {
    const roles: CampusRoles = new Map<string, StaffRole>([
      [CAMPUS, 'admin'],
      [OTHER_CAMPUS, 'staff'],
    ])
    expect(managedCampusIds(roles)).toEqual([CAMPUS, OTHER_CAMPUS])
    expect(managedCampusIds(new Map())).toEqual([])
  })
})
