import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import type { Context, MiddlewareHandler } from 'hono'

import type { AppEnv } from '../types.ts'
import { AppError } from './errors.ts'

// Generic anti-abuse limiter (SDD 11, 12): by IP on sign-in and by account on writes, with wide
// margins. It is not part of any SRS rule, so it fails open: without Upstash configured, or when
// Upstash does not answer, every request passes. The 10 reports per hour of RNF-SEGURIDAD-03 are
// counted in the database instead (DD-11).

export type RateLimiter = {
  // true when the request may pass.
  allow(key: string): Promise<boolean>
}

export type RateLimiters = { login: RateLimiter; write: RateLimiter }

// Users of a campus network can share one public IP, hence the margin on sign-in.
const LOGIN_PER_MINUTE = 30
const WRITES_PER_MINUTE = 60
// Upstash answers in a few ms; past this the request passes (fail open).
const TIMEOUT_MS = 1000

const allowAll: RateLimiter = { allow: async () => true }

function upstashLimiter(redis: Redis, prefix: string, tokens: number): RateLimiter {
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, '1 m'),
    prefix: `cima-fix:${prefix}`,
    timeout: TIMEOUT_MS,
  })
  return { allow: async (key) => (await ratelimit.limit(key)).success }
}

let current: RateLimiters | undefined

// Built from the environment on first use (SDD 15.2). Tests inject fakes with `setRateLimiters`.
export function getRateLimiters(): RateLimiters {
  if (!current) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (url && token) {
      const redis = new Redis({ url, token })
      current = { login: upstashLimiter(redis, 'login', LOGIN_PER_MINUTE), write: upstashLimiter(redis, 'write', WRITES_PER_MINUTE) }
    } else {
      current = { login: allowAll, write: allowAll }
    }
  }
  return current
}

/** Tests only. */
export function setRateLimiters(limiters: RateLimiters | undefined): void {
  current = limiters
}

async function check(limiter: RateLimiter, key: string): Promise<void> {
  let allowed = true
  try {
    allowed = await limiter.allow(key)
  } catch (error) {
    console.error('Rate limiter unavailable', error)
  }
  if (!allowed) {
    throw new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.')
  }
}

// On Vercel the first address of x-forwarded-for is the client's (Vercel sets the header).
function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
}

// POST /api/auth/google, by IP.
export const loginRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  await check(getRateLimiters().login, `ip:${clientIp(c)}`)
  await next()
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Every write with a session, by account. Requests without a session pass on to
// `sessionRequired`, which answers 401.
export const writeRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const viewer = c.get('viewer')
  if (viewer && WRITE_METHODS.has(c.req.method)) {
    await check(getRateLimiters().write, `account:${viewer.accountId}`)
  }
  await next()
}