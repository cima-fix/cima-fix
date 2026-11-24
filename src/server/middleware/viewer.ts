import type { Context, MiddlewareHandler } from 'hono'
import type { Viewer } from '../../shared/types/viewer.ts'
import type { AppEnv } from '../types.ts'
import { AppError } from './errors.ts'

/** Placeholder until phase 3 (Access) ships the real session middleware. */
export const anonymousSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('viewer', null)
  await next()
}

/** 401 when there is no valid session (SDD 7.1). */
export function requireViewer(c: Context<AppEnv>): Viewer {
  const viewer = c.get('viewer')
  if (!viewer)
    throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.')
  return viewer
}
