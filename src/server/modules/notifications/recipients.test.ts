import { describe, expect, it } from 'vitest'

import { resolveRecipients } from './recipients.ts'

describe('resolveRecipients', () => {
  it('RF-NOTIFICACION-09: leaves out the account that performed the action', () => {
    expect(resolveRecipients(['a', 'b', 'actor'], 'actor')).toEqual(['a', 'b'])
  })

  it('RF-NOTIFICACION-18: keeps the actor in alerts', () => {
    expect(resolveRecipients(['a', 'actor'], 'actor', { includeActor: true })).toEqual(['a', 'actor'])
  })

  it('RF-NOTIFICACION-10: one email per account, even when it matches several conditions', () => {
    // The reporter is also the assignee and confirmed nothing; another account confirmed twice.
    expect(resolveRecipients(['reporter', 'reporter', 'confirmer', 'confirmer'], 'actor')).toEqual([
      'reporter',
      'confirmer',
    ])
  })

  it('skips a missing assignee', () => {
    expect(resolveRecipients(['reporter', null, undefined], 'actor')).toEqual(['reporter'])
  })
})