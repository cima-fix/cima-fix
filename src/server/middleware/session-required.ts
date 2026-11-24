import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '../types.ts'
import { requireViewer } from './viewer.ts'

// SDD 7.1: every route answers 401 without a valid session, before validating its input. It goes
// first in each route, not in `use('*')` of a module router: a router mounted on '/' would pass
// that middleware on to the routes of every other module, including the ones without session.
export const sessionRequired: MiddlewareHandler<AppEnv> = async (c, next) => {
  requireViewer(c)
  await next()
}
