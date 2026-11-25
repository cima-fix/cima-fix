import { waitUntil } from '@vercel/functions'

import { can } from '../../../shared/domain/permissions.ts'
import { crossedThresholds } from '../../../shared/domain/thresholds.ts'
import { reportVisibility } from '../../../shared/domain/visibility.ts'
import type { AlertThresholdsBody } from '../../../shared/schemas/thresholds.ts'
import type { StaffRole } from '../../../shared/types/common.ts'
import type { DomainEvent } from '../../../shared/types/events.ts'
import type { Viewer } from '../../../shared/types/viewer.ts'
import { setEventDispatcher, withCampusLock } from '../../db/campus-lock.ts'
import { getDb, type Executor } from '../../db/client.ts'
import { thresholdSnapshot } from '../../db/threshold-snapshot.ts'
import { getMailer, type Email } from '../../integrations/mailer.ts'
import { AppError } from '../../middleware/errors.ts'
import { resolveRecipients } from './recipients.ts'
import * as repo from './repository.ts'
import {
  reportAssignedEmail,
  reportCancelledEmail,
  reportResolvedEmail,
  roleAssignedEmail,
  thresholdReachedEmail,
} from './templates.ts'

// Notifications (SDD 14, DD-10). The services emit domain events inside their transaction; this
// module turns them into emails after the COMMIT and sends them in the background, one email per
// recipient and without retries.

// Public URL of the SPA (SDD 15.2), for the links of the emails.
function appUrl(): string {
  return (process.env.APP_BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
}

// RF-GESTION-18: the own link of each report.
const reportUrl = (reportId: string) => `${appUrl()}/reportes/${reportId}`

// SDD 14.1: the emails of one event, read from the state after the COMMIT.
export async function emailsFor(event: DomainEvent, db: Executor = getDb(), now: Date = new Date()): Promise<Email[]> {
  switch (event.type) {
    case 'ReportAssigned': {
      const report = await repo.findReport(db, event.reportId)
      if (!report) return []
      // RF-NOTIFICACION-01: only the account left assigned, not the previous one.
      const ids = resolveRecipients([event.assigneeId], event.actorId)
      const recipients = await repo.findRecipients(db, event.campusId, ids)
      return recipients.map((r) => reportAssignedEmail(r.email, report, reportUrl(event.reportId)))
    }

    case 'ReportResolved': {
      const report = await repo.findReport(db, event.reportId)
      if (!report) return []
      // RF-NOTIFICACION-02
      const ids = resolveRecipients([report.reporterId, ...(await repo.findConfirmers(db, event.reportId))], event.actorId)
      const recipients = await repo.findRecipients(db, event.campusId, ids)
      return recipients.map((r) => reportResolvedEmail(r.email, report, reportUrl(event.reportId)))
    }

    case 'ReportCancelled': {
      const report = await repo.findReport(db, event.reportId)
      if (!report) return []
      // RF-NOTIFICACION-03
      const ids = resolveRecipients(
        [report.reporterId, report.assigneeId, ...(await repo.findConfirmers(db, event.reportId))],
        event.actorId,
      )
      const recipients = await repo.findRecipients(db, event.campusId, ids)
      return recipients.map((r) => {
        // RF-NOTIFICACION-08 (SDD 10.4): only who can still see the cancelled report gets its link.
        const roles = new Map<string, StaffRole>(r.role ? [[event.campusId, r.role]] : [])
        const visible = reportVisibility(report, roles, now) === 'visible'
        return reportCancelledEmail(r.email, report, visible ? reportUrl(event.reportId) : null)
      })
    }

    case 'RoleAssigned': {
      const campus = await repo.findCampusName(db, event.campusId)
      if (!campus) return []
      // RF-NOTIFICACION-04: also for an account that never signed in.
      const ids = resolveRecipients([event.accountId], event.actorId)
      const recipients = await repo.findRecipients(db, event.campusId, ids)
      return recipients.map((r) => roleAssignedEmail(r.email, campus, event.role, appUrl()))
    }

    case 'ThresholdReached': {
      const campus = await repo.findCampusName(db, event.campusId)
      if (!campus) return []
      // RF-NOTIFICACION-18: every staff member and admin of the campus, including the actor.
      const ids = resolveRecipients(await repo.findCampusStaff(db, event.campusId), event.actorId, { includeActor: true })
      const recipients = await repo.findRecipients(db, event.campusId, ids)
      return recipients.map((r) =>
        thresholdReachedEmail(r.email, campus, event.status, event.count, `${appUrl()}/reportes`),
      )
    }
  }
}

// Builds and sends the emails of a batch of events. A failure is logged and dropped: the action
// that emitted the events is already committed (RNF-DISPONIBILIDAD-05) and nothing is retried
// (RNF-DISPONIBILIDAD-06).
export async function deliver(events: DomainEvent[]): Promise<void> {
  try {
    const emails = (await Promise.all(events.map((event) => emailsFor(event)))).flat()
    if (emails.length > 0) await getMailer().send(emails)
  } catch (error) {
    console.error('Notification delivery failed', error)
  }
}

// Registered by the entry points (Vercel function and local server). The response goes out right
// away and `waitUntil` keeps the function alive until the emails reach Resend
// (RNF-RENDIMIENTO-05). Outside Vercel, `waitUntil` does nothing and the promise just runs.
export function startNotifications(): void {
  setEventDispatcher((events) => {
    waitUntil(deliver(events))
  })
}

// PUT /api/campuses/:id/alert-thresholds (RF-NOTIFICACION-13…17). Lowering or setting a threshold
// at or below the current count reaches it (RN-07, SDD 9.2).
export async function setAlertThresholds(
  viewer: Viewer,
  campusId: string,
  body: AlertThresholdsBody,
): Promise<AlertThresholdsBody> {
  if (!can(viewer.roles, 'alertThresholds.manage', campusId)) {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para configurar las alertas de este campus.')
  }
  return withCampusLock(campusId, async ({ tx, emit }) => {
    const before = await thresholdSnapshot(tx, campusId)
    await repo.updateAlertThresholds(tx, campusId, body)
    const after = { ...before, thresholdNew: body.new, thresholdInReview: body.inReview }
    for (const status of crossedThresholds(before, after)) {
      emit({
        type: 'ThresholdReached',
        campusId,
        actorId: viewer.accountId,
        status,
        count: status === 'new' ? after.newCount : after.inReviewCount,
      })
    }
    return { new: body.new, inReview: body.inReview }
  })
}