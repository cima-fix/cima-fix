import { describe, expect, it } from 'vitest'

import type { CampusRoles } from '../../../shared/domain/permissions'
import type { StaffRole } from '../../../shared/types/common'
import { createPhotoStorage } from '../../integrations/cloudinary'
import { allowedActions, toReportView, type ReportRecord, type ReportViewer } from './view'

const CAMPUS = 'campus-a'
const OTHER_CAMPUS = 'campus-b'

const photos = createPhotoStorage({
  cloudName: 'cima-fix-test',
  apiKey: 'key',
  apiSecret: 'secret',
  folder: 'cima-fix/local',
})

const report: ReportRecord = {
  id: 'report-1',
  campus: { id: CAMPUS, name: 'Campus Sauzal' },
  building: { id: 'building-1', name: 'Edificio 5' },
  space: { id: 'space-1', name: 'Salón 204' },
  category: { id: 'category-1', name: 'Iluminación' },
  description: 'No enciende la lámpara.',
  status: 'in_review',
  priority: 2,
  confirmationCount: 0,
  createdAt: new Date('2026-11-20T18:30:00Z'),
  resolvedAt: null,
  reporter: { id: 'reporter', email: 'reporta@uabc.edu.mx' },
  assignee: { id: 'staff', email: 'encargado@uabc.edu.mx' },
  photos: [{ publicId: 'cima-fix/local/p1', version: 1 }],
}

function viewer(accountId: string, role?: StaffRole, campusId = CAMPUS): ReportViewer {
  const roles: CampusRoles = new Map(role ? [[campusId, role]] : [])
  return { accountId, roles }
}

const someone = viewer('someone')
const reporter = viewer('reporter')
const assignedStaff = viewer('staff', 'staff')
const otherStaff = viewer('other-staff', 'staff')
const admin = viewer('admin', 'admin')
const staffElsewhere = viewer('staff-b', 'staff', OTHER_CAMPUS)

const NOT_CONFIRMED = { confirmedByViewer: false }

describe('toReportView', () => {
  it('RF-GESTION-02: includes the data shown for every report', () => {
    const view = toReportView(report, someone, { photos, confirmedByViewer: false })
    expect(view).toMatchObject({
      id: 'report-1',
      campus: { id: CAMPUS, name: 'Campus Sauzal' },
      building: { name: 'Edificio 5' },
      space: { name: 'Salón 204' },
      category: { name: 'Iluminación' },
      description: 'No enciende la lámpara.',
      status: 'in_review',
      priority: 'medium',
      confirmationCount: 0,
      createdAt: '2026-11-20T18:30:00.000Z',
      resolvedAt: null,
    })
    expect(view.photos).toEqual([photos.urls(report.photos[0]!)])
  })

  it('RF-GESTION-17: includes the resolution date of a resolved report', () => {
    const resolved = { ...report, status: 'resolved' as const, resolvedAt: new Date('2026-11-21T10:00:00Z') }
    expect(toReportView(resolved, someone, { photos, confirmedByViewer: false }).resolvedAt).toBe('2026-11-21T10:00:00.000Z')
  })

  it('RN-04: staff and admins of the campus receive both emails', () => {
    for (const account of [assignedStaff, admin]) {
      expect(toReportView(report, account, { photos, confirmedByViewer: false })).toMatchObject({
        reporterEmail: 'reporta@uabc.edu.mx',
        assigneeEmail: 'encargado@uabc.edu.mx',
      })
    }
  })

  it('RN-04: an unassigned report sends a null assignee email to staff', () => {
    const unassigned = { ...report, status: 'new' as const, assignee: null }
    expect(toReportView(unassigned, admin, { photos, confirmedByViewer: false }).assigneeEmail).toBeNull()
  })

  it('RF-GESTION-05: the emails are not sent to reporters, not even to the one who registered it', () => {
    for (const account of [someone, reporter]) {
      const view = toReportView(report, account, { photos, confirmedByViewer: false })
      expect(view).not.toHaveProperty('reporterEmail')
      expect(view).not.toHaveProperty('assigneeEmail')
    }
  })

  it('SDD 8.2: tells whether the viewer registered or confirmed the report', () => {
    expect(toReportView(report, reporter, { photos, confirmedByViewer: false })).toMatchObject({
      reportedByMe: true,
      confirmedByMe: false,
    })
    expect(toReportView(report, someone, { photos, confirmedByViewer: true })).toMatchObject({
      reportedByMe: false,
      confirmedByMe: true,
    })
  })

  it('RN-01: the emails are not sent to staff of another campus', () => {
    const view = toReportView(report, staffElsewhere, { photos, confirmedByViewer: false })
    expect(JSON.stringify(view)).not.toContain('@uabc.edu.mx')
  })
})

describe('allowedActions', () => {
  const unconfirmedNew = { ...report, status: 'new' as const, assignee: null }

  it('RF-GESTION-01: a reporter cannot assign or resolve', () => {
    expect(allowedActions(report, someone, NOT_CONFIRMED)).toEqual([])
  })

  it('RN-03: the reporter may cancel a report it registered while it has no confirmations', () => {
    expect(allowedActions(unconfirmedNew, reporter, NOT_CONFIRMED)).toEqual(['cancel'])
    expect(allowedActions({ ...unconfirmedNew, confirmationCount: 1 }, reporter, NOT_CONFIRMED)).toEqual([])
  })

  it('RN-03: staff of the campus may assign and cancel any report', () => {
    expect(allowedActions(unconfirmedNew, otherStaff, NOT_CONFIRMED)).toEqual(['assign', 'cancel'])
  })

  it('RN-03: only the staff member it is assigned to may resolve it', () => {
    expect(allowedActions(report, assignedStaff, NOT_CONFIRMED)).toEqual(['assign', 'resolve', 'cancel'])
    expect(allowedActions(report, otherStaff, NOT_CONFIRMED)).not.toContain('resolve')
  })

  it('RN-03: admins assign and cancel but never resolve', () => {
    const assignedToAdmin = { ...report, assignee: { id: 'admin', email: 'admin@uabc.edu.mx' } }
    expect(allowedActions(assignedToAdmin, admin, NOT_CONFIRMED)).toEqual(['assign', 'cancel'])
  })

  it('RN-01: staff of another campus have only the actions of a reporter', () => {
    expect(allowedActions(report, staffElsewhere, NOT_CONFIRMED)).toEqual([])
  })

  it('RF-GESTION-11: no action is offered on a closed report', () => {
    for (const status of ['resolved', 'cancelled'] as const) {
      const closed = { ...report, status, resolvedAt: status === 'resolved' ? new Date() : null }
      expect(allowedActions(closed, assignedStaff, { asPossibleDuplicate: true, confirmedByViewer: false })).toEqual([])
    }
  })

  it('RF-DUPLICADO-03: a possible duplicate can be confirmed by another account', () => {
    expect(allowedActions(unconfirmedNew, someone, { asPossibleDuplicate: true, confirmedByViewer: false })).toEqual(['confirm'])
  })

  it('RF-DUPLICADO-05: not by the account that registered it, nor twice', () => {
    expect(allowedActions(unconfirmedNew, reporter, { asPossibleDuplicate: true, confirmedByViewer: false })).not.toContain('confirm')
    expect(
      allowedActions(unconfirmedNew, someone, { asPossibleDuplicate: true, confirmedByViewer: true }),
    ).not.toContain('confirm')
  })

  it('offers confirmation only when the report is shown as a possible duplicate', () => {
    expect(allowedActions(unconfirmedNew, someone, NOT_CONFIRMED)).not.toContain('confirm')
  })
})
