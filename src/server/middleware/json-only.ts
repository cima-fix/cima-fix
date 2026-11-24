import type { MiddlewareHandler } from 'hono'
import { AppError } from './errors.ts'

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** SDD 7.1 / 11: mutating requests must declare `Content-Type: application/json`, else 415. */
export const jsonOnly: MiddlewareHandler = async (c, next) => {
  if (METHODS_WITH_BODY.has(c.req.method)) {
    const type = c.req
      .header('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase()
    if (type !== 'application/json') {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'La solicitud debe enviarse como JSON.',
      )
    }
  }
  await next()
}
