import { describe, expect, it, vi } from 'vitest'

import { ExternalServiceUnavailable } from './errors.ts'
import { createConsoleMailer, createResendMailer, RESEND_BATCH_SIZE, type Email } from './mailer.ts'

const email = (i: number): Email => ({ to: `user${i}@uabc.edu.mx`, subject: `Asunto ${i}`, html: '<p>Hola</p>', text: 'Hola' })

function fakeFetch(status = 200) {
  return vi.fn<typeof globalThis.fetch>(async () => new Response('{"data":[]}', { status }))
}

describe('resend mailer', () => {
  it('RF-NOTIFICACION-20: sends each email with a single recipient and no cc or bcc', async () => {
    const fetch = fakeFetch()
    await createResendMailer({ apiKey: 're_test', from: 'Cima Fix <avisos@cimafix.mx>', fetch }).send([email(1), email(2)])

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.resend.com/emails/batch')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ authorization: 'Bearer re_test', 'content-type': 'application/json' })
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>[]
    expect(body).toEqual([
      { from: 'Cima Fix <avisos@cimafix.mx>', to: ['user1@uabc.edu.mx'], subject: 'Asunto 1', html: '<p>Hola</p>', text: 'Hola' },
      { from: 'Cima Fix <avisos@cimafix.mx>', to: ['user2@uabc.edu.mx'], subject: 'Asunto 2', html: '<p>Hola</p>', text: 'Hola' },
    ])
    for (const message of body) {
      expect(message).not.toHaveProperty('cc')
      expect(message).not.toHaveProperty('bcc')
    }
  })

  it('SDD 14.2: splits the emails in batches of at most 100', async () => {
    const fetch = fakeFetch()
    const emails = Array.from({ length: RESEND_BATCH_SIZE * 2 + 5 }, (_, i) => email(i))
    await createResendMailer({ apiKey: 'k', from: 'f', fetch }).send(emails)
    const sizes = fetch.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as unknown[]).length)
    expect(sizes).toEqual([100, 100, 5])
  })

  it('SDD 12: an error answer of Resend becomes ExternalServiceUnavailable, after trying every batch', async () => {
    const fetch = fakeFetch(500)
    const emails = Array.from({ length: RESEND_BATCH_SIZE + 1 }, (_, i) => email(i))
    await expect(createResendMailer({ apiKey: 'k', from: 'f', fetch }).send(emails)).rejects.toBeInstanceOf(
      ExternalServiceUnavailable,
    )
    // Two different batches, each sent once: no retry (RNF-DISPONIBILIDAD-06).
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('SDD 12: a network error becomes ExternalServiceUnavailable', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(createResendMailer({ apiKey: 'k', from: 'f', fetch }).send([email(1)])).rejects.toBeInstanceOf(
      ExternalServiceUnavailable,
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('console mailer', () => {
  it('SDD 15.1: prints each email instead of sending it', async () => {
    const log = vi.fn()
    await createConsoleMailer(log).send([email(1), email(2)])
    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls[0]?.[0]).toContain('To: user1@uabc.edu.mx')
    expect(log.mock.calls[0]?.[0]).toContain('Subject: Asunto 1')
  })
})