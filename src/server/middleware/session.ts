import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'

import { findViewerBySessionToken } from '../modules/access/service.ts'
import { SESSION_COOKIE } from '../modules/access/session-token.ts'
import type { AppEnv } from '../types.ts'

// Session middleware (SDD DD-04, 10.3): reads the `cf_session` cookie, looks up its hash in the
// database and loads the roles of the account once per request. No cookie, an unknown token or
// an expired session leave `viewer` as null, and `sessionRequired` answers 401. It never calls
// Google, so accounts already signed in keep working while Google is down
// (RNF-DISPONIBILIDAD-02).
export const session: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  c.set('viewer', token ? await findViewerBySessionToken(token) : null)
  await next()
}