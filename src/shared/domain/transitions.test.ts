import { describe, expect, it } from 'vitest'

import { REPORT_STATUSES } from '../types/common.ts'
import { isOpen, nextStatus, type ReportAction } from './transitions.ts'

const ACTIONS: ReportAction[] = ['assign', 'resolve', 'cancel']

describe('nextStatus', () => {
  it('RF-GESTION-08: assigning a new report moves it to in review', () => {
    expect(nextStatus('new', 'assign')).toBe('in_review')
  })

  it('RF-GESTION-09: reassigning keeps the report in review', () => {
    expect(nextStatus('in_review', 'assign')).toBe('in_review')
  })

  it('RF-GESTION-12: a report in review can be resolved', () => {
    expect(nextStatus('in_review', 'resolve')).toBe('resolved')
  })

  it('RF-GESTION-13: new and in review reports can be cancelled', () => {
    expect(nextStatus('new', 'cancel')).toBe('cancelled')
    expect(nextStatus('in_review', 'cancel')).toBe('cancelled')
  })

  it('RF-GESTION-11: rejects resolving a new report', () => {
    expect(nextStatus('new', 'resolve')).toBeNull()
  })

  it.each(['resolved', 'cancelled'] as const)(
    'RF-GESTION-11: rejects every change from %s, including reopening it',
    (status) => {
      for (const action of ACTIONS) {
        expect(nextStatus(status, action)).toBeNull()
      }
    },
  )

  it('RF-GESTION-11: no action leads back to new', () => {
    for (const status of REPORT_STATUSES) {
      for (const action of ACTIONS) {
        expect(nextStatus(status, action)).not.toBe('new')
      }
    }
  })
})

describe('isOpen', () => {
  it('treats only new and in review as open', () => {
    expect(REPORT_STATUSES.filter(isOpen)).toEqual(['new', 'in_review'])
  })
})
