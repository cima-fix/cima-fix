import { eq } from 'drizzle-orm'
import type { DomainEvent } from '../../shared/types/events'
import { AppError } from '../middleware/errors'
import { getDb, type Tx } from './client'
import { campuses } from './schema'

export type CampusLockContext = {
  tx: Tx
  /** Queue an event; it is dispatched only after COMMIT. */
  emit: (event: DomainEvent) => void
}

export type EventDispatcher = (events: DomainEvent[]) => void | Promise<void>

let dispatcher: EventDispatcher | null = null

/**
 * Registered by the notifications module (phase 5). Until then events are
 * dropped, so Management and Registration can emit from day one without code
 * changes later. The dispatcher must return fast (use `waitUntil` inside), see DD-10.
 */
export function setEventDispatcher(fn: EventDispatcher | null): void {
  dispatcher = fn
}

/**
 * Every write of campus data runs here (DD-08): opens a transaction, locks the
 * campus row (`SELECT … FOR UPDATE`), runs `fn`, commits, then dispatches the
 * collected events. If `fn` throws, everything rolls back and no event is dispatched.
 */
export async function withCampusLock<T>(
  campusId: string,
  fn: (ctx: CampusLockContext) => Promise<T>,
): Promise<T> {
  const events: DomainEvent[] = []

  const result = await getDb().transaction(async (tx) => {
    const [campus] = await tx
      .select({ id: campuses.id })
      .from(campuses)
      .where(eq(campuses.id, campusId))
      .for('update')
    if (!campus)
      throw new AppError(404, 'CAMPUS_NOT_FOUND', 'El campus no existe.')
    return fn({ tx, emit: (event) => events.push(event) })
  })

  if (events.length > 0 && dispatcher) {
    try {
      await dispatcher(events)
    } catch (error) {
      // A notification failure must never fail the action (RNF-DISPONIBILIDAD-05).
      console.error('Event dispatch failed', error)
    }
  }
  return result
}
