import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_QUERY } from '../../lib/media'
import { homeLoader } from './data'

const reportsGet = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ reports: [], nextCursor: null }) }))

vi.mock('../../api', () => ({ api: { reports: { $get: () => reportsGet() } } }))
vi.mock('../../lib/session', () => ({
  loadSession: async () => ({ campus: { id: 'c1' }, roles: new Map([['c1', 'staff']]) }),
  sessionCan: () => true,
}))

function stubScreen(desktop: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches: desktop && query === DESKTOP_QUERY }))
  vi.stubGlobal('window', { matchMedia })
}

const args = { request: new Request('http://localhost/'), params: {}, context: {} } as Parameters<typeof homeLoader>[0]

describe('homeLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    reportsGet.mockClear()
  })

  it('does not request the reports on a phone', async () => {
    stubScreen(false)
    expect(await homeLoader(args)).toEqual({ dashboard: null })
    expect(reportsGet).not.toHaveBeenCalled()
  })

  it('requests the new and the assigned reports on desktop', async () => {
    stubScreen(true)
    expect(await homeLoader(args)).toEqual({
      dashboard: { counts: { unassigned: 0, assignedToMe: 0 }, urgent: [] },
    })
    expect(reportsGet).toHaveBeenCalledTimes(2)
  })
})
