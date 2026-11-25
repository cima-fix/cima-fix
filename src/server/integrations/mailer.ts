import { ExternalServiceUnavailable } from './errors.ts'

// Sending of the emails of 3.3.8 (SDD 14.2, DD-10). Resend in production; a console version
// locally and in preview, so they do not spend the daily quota (R-06, SDD 15.1).

export type Email = {
  // RF-NOTIFICACION-20: exactly one recipient per email, never cc or bcc.
  to: string
  subject: string
  html: string
  text: string
}

export type Mailer = {
  // Throws ExternalServiceUnavailable when Resend fails. The caller logs it and never retries
  // (RNF-DISPONIBILIDAD-06).
  send(emails: Email[]): Promise<void>
}

export type ResendConfig = {
  apiKey: string
  from: string
  fetch?: typeof fetch
}

// Batch endpoint of the Resend REST API: up to 100 emails per call (SDD 14.2).
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch'
export const RESEND_BATCH_SIZE = 100
// Well within the minute of RNF-RENDIMIENTO-05.
const TIMEOUT_MS = 10_000

export function createResendMailer(config: ResendConfig): Mailer {
  const fetchImpl = config.fetch ?? fetch

  async function sendBatch(batch: Email[]): Promise<void> {
    let res: Response
    try {
      res = await fetchImpl(RESEND_BATCH_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(
          batch.map((email) => ({
            from: config.from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
          })),
        ),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      throw new ExternalServiceUnavailable('resend', error)
    }
    if (!res.ok) {
      throw new ExternalServiceUnavailable('resend', new Error(`Resend answered ${res.status}: ${await res.text()}`))
    }
  }

  return {
    async send(emails) {
      // Each batch holds different emails, so a failed one does not stop the others; it is not a
      // retry of the same email.
      const failures: unknown[] = []
      for (let i = 0; i < emails.length; i += RESEND_BATCH_SIZE) {
        try {
          await sendBatch(emails.slice(i, i + RESEND_BATCH_SIZE))
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length > 0) throw failures[0]
    },
  }
}

// Prints each email in the terminal instead of sending it (SDD 15.1).
export function createConsoleMailer(log: (text: string) => void = console.info): Mailer {
  return {
    async send(emails) {
      for (const email of emails) {
        log(`[mail] To: ${email.to}\n[mail] Subject: ${email.subject}\n${email.text}\n`)
      }
    },
  }
}

let current: Mailer | undefined

// Resend when RESEND_API_KEY and MAIL_FROM are set (SDD 15.2), the console otherwise. Tests
// inject a fake with `setMailer`.
export function getMailer(): Mailer {
  if (!current) {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.MAIL_FROM
    current = apiKey && from ? createResendMailer({ apiKey, from }) : createConsoleMailer()
  }
  return current
}

/** Tests only. */
export function setMailer(mailer: Mailer | undefined): void {
  current = mailer
}