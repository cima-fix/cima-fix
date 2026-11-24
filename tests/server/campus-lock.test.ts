import { count } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../src/server/db/client.ts'
import { setEventDispatcher, withCampusLock } from '../../src/server/db/campus-lock.ts'
import { accounts } from '../../src/server/db/schema.ts'
import { AppError } from '../../src/server/middleware/errors.ts'
import type { DomainEvent } from '../../src/shared/types/events.ts'
import { useTestDb } from '../helpers/db.ts'
import { makeCampus } from '../helpers/factories.ts'

/** These tests check the plumbing (when events are dispatched), not each event's payload. */
function event(type: 'ReportAssigned' | 'ReportResolved', campusId: string) {
  return { type, campusId, actorId: 'actor-1' } as DomainEvent
}

describe('withCampusLock', () => {
  useTestDb()
  afterEach(() => setEventDispatcher(null))

  it('dispatches queued events only after COMMIT', async () => {
    const dispatch = vi.fn()
    setEventDispatcher(dispatch)
    const campus = await makeCampus()
    const queued = event('ReportAssigned', campus.id)

    const result = await withCampusLock(campus.id, async ({ emit }) => {
      emit(queued)
      expect(dispatch).not.toHaveBeenCalled()
      return 'ok'
    })

    expect(result).toBe('ok')
    expect(dispatch).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith([queued])
  })

  it('rolls back writes and drops events when the callback throws', async () => {
    const dispatch = vi.fn()
    setEventDispatcher(dispatch)
    const campus = await makeCampus()

    await expect(
      withCampusLock(campus.id, async ({ tx, emit }) => {
        await tx.insert(accounts).values({ email: 'rollback@uabc.edu.mx' })
        emit(event('ReportAssigned', campus.id))
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const [row] = await getDb().select({ n: count() }).from(accounts)
    expect(row?.n).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('answers 404 CAMPUS_NOT_FOUND for an unknown campus', async () => {
    const error = await withCampusLock('00000000-0000-0000-0000-000000000000', async () => 1).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status: 404, code: 'CAMPUS_NOT_FOUND' })
  })

  it('does not fail the action when the dispatcher fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setEventDispatcher(() => {
      throw new Error('resend down')
    })
    const campus = await makeCampus()
    await expect(
      withCampusLock(campus.id, async ({ emit }) => {
        emit(event('ReportResolved', campus.id))
        return 'done'
      }),
    ).resolves.toBe('done')
  })
})