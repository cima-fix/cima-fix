import { afterEach, describe, expect, it, vi } from 'vitest'
import { listReports } from '../../lib/demo-api'
import { DESKTOP_QUERY } from '../../lib/media'
import { homeLoader } from './data'

vi.mock('../../lib/demo-api', () => ({ listReports: vi.fn(async () => []) }))

function stubScreen(desktop: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches: desktop && query === DESKTOP_QUERY }))
  vi.stubGlobal('window', { matchMedia })
}

describe('homeLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(listReports).mockClear()
  })

  it('does not request the reports on a phone', async () => {
    stubScreen(false)
    expect(await homeLoader()).toEqual({ reports: null })
    expect(listReports).not.toHaveBeenCalled()
  })

  it('requests the reports on desktop', async () => {
    stubScreen(true)
    expect(await homeLoader()).toEqual({ reports: [] })
    expect(listReports).toHaveBeenCalledOnce()
  })
})
