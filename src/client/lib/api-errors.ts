import { redirect } from 'react-router'

// Error of an API call (SDD 7.1): the stable `code` for the SPA to decide what to do, and the
// Spanish `message` ready to show (SDD 13.1, "mismo texto, misma regla").
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string
  // The rest of the error body, e.g. `duplicates` of NEW_DUPLICATES (SDD 8.2).
  readonly body: Record<string, unknown>

  constructor(status: number, code: string, message: string, field?: string, body: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
    this.body = body
  }
}

const NETWORK_MESSAGE = 'No pudimos conectar con Cima Fix. Revisa tu conexión e inténtalo de nuevo.'
const UNEXPECTED_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.'

type Response<T> = { ok: boolean; status: number; json(): Promise<T> }

async function errorOf(response: { status: number; json(): Promise<unknown> }): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as
    | ({ error?: { code?: string; message?: string; field?: string } } & Record<string, unknown>)
    | null
  const error = body?.error
  return new ApiError(
    response.status,
    error?.code ?? 'UNEXPECTED',
    error?.message ?? UNEXPECTED_MESSAGE,
    error?.field,
    body ?? {},
  )
}

async function settle<T>(call: Promise<Response<T>>): Promise<Response<T>> {
  try {
    return await call
  } catch {
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE)
  }
}

// The JSON of a successful response; anything else throws ApiError.
export async function read<T>(call: Promise<Response<T>>): Promise<T> {
  const response = await settle(call)
  if (!response.ok) throw await errorOf(response)
  return response.json()
}

// For the responses without a body (204).
export async function send(call: Promise<Response<unknown>>): Promise<void> {
  const response = await settle(call)
  if (!response.ok) throw await errorOf(response)
}

// SDD 8.1: `next` only takes internal paths that start with "/" and not "//" (or "/\"), so
// signing in can never become an open redirect.
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : '/'
}

export function signInPath(request: Request) {
  const url = new URL(request.url)
  return `/ingresar?${new URLSearchParams({ next: url.pathname + url.search })}`
}

// RF-ACCESO-01, RF-REPORTE-11, RF-GESTION-21: without a session (401), go to /ingresar and come
// back to the same address after signing in. Wraps a loader or an action.
export function withSignIn<A extends { request: Request }, R>(handler: (args: A) => Promise<R>) {
  return async (args: A): Promise<R> => {
    try {
      return await handler(args)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw redirect(signInPath(args.request))
      throw error
    }
  }
}
