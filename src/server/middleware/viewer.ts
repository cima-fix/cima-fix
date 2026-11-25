import type { Context } from 'hono'
import type { Viewer } from '../../shared/types/viewer.ts'
import type { AppEnv } from '../types.ts'
import { AppError } from './errors.ts'

/** 401 when there is no valid session (SDD 7.1). */
export function requireViewer(c: Context<AppEnv>): Viewer {
  const viewer = c.get('viewer')
  if (!viewer)
    throw new AppError(401, 'UNAUTHENTICATED', 'Inicia sesión para continuar.')
  return viewer
}