import type { ErrorHandler, Hono, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** Error response shape (SDD 7.1). `message` is Spanish and ready to display. */
export type ErrorBody = {
  error: { code: string; message: string; field?: string }
}

export class AppError extends Error {
  status: ContentfulStatusCode
  code: string
  field?: string

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    field?: string,
  ) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.field = field
  }
}

export function errorBody(
  code: string,
  message: string,
  field?: string,
): ErrorBody {
  return { error: { code, message, ...(field ? { field } : {}) } }
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(errorBody(err.code, err.message, err.field), err.status)
  }
  // e.g. malformed JSON rejected by the validator
  if (err instanceof HTTPException && err.status === 400) {
    return c.json(errorBody('BAD_REQUEST', 'La solicitud no es válida.'), 400)
  }
  console.error(err)
  return c.json(
    errorBody(
      'INTERNAL_ERROR',
      'Ocurrió un error inesperado. Inténtalo de nuevo.',
    ),
    500,
  )
}

function routeMatches(pattern: string, path: string): boolean {
  const source = pattern
    .split('/')
    .map((seg) =>
      seg.startsWith(':')
        ? '[^/]+'
        : seg === '*'
          ? '.*'
          : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/')
  return new RegExp(`^${source}/?$`).test(path)
}

/** 404, or 405 with `Allow` when the path exists for another method (SDD 7.1). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notFoundHandler(app: Hono<any, any, any>): NotFoundHandler {
  return (c) => {
    const path = new URL(c.req.url).pathname
    const allowed = new Set<string>()
    for (const route of app.routes) {
      if (route.method !== 'ALL' && routeMatches(route.path, path))
        allowed.add(route.method)
    }
    if (allowed.size > 0) {
      c.header('Allow', [...allowed].join(', '))
      return c.json(
        errorBody('METHOD_NOT_ALLOWED', 'Método no permitido.'),
        405,
      )
    }
    return c.json(
      errorBody('NOT_FOUND', 'El recurso solicitado no existe.'),
      404,
    )
  }
}
