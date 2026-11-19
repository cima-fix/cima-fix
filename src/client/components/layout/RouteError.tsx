import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ButtonLink } from '../ui/Button'
import { ScreenHeader } from './ScreenHeader'

// Fallback for unknown routes, missing reports and unexpected errors.
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const message =
    isRouteErrorResponse(error) && typeof error.data === 'string' && error.data
      ? error.data
      : notFound
        ? 'Esta página no existe.'
        : 'Algo salió mal. Intenta de nuevo.'

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-neutral-white">
      <ScreenHeader title={notFound ? 'No encontrado' : 'Error'} />
      <div className="flex flex-col gap-3 px-4 py-6">
        <p className="text-body text-neutral-text-secondary">{message}</p>
        <ButtonLink to="/">Ir al inicio</ButtonLink>
      </div>
    </div>
  )
}
