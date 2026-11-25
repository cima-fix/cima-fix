import type { ReactNode } from 'react'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Notice } from '../../components/ui/Notice'
import type { ActionResult } from './data'

type AdminScreenProps = {
  title: string
  subtitle: string
  allowed: boolean
  children: ReactNode
}

// Frame of the management screens: header and, for an account without the role, the
// "acceso no permitido" notice instead of the content (SDD 13.2).
export function AdminScreen({ title, subtitle, allowed, children }: AdminScreenProps) {
  return (
    <>
      <ScreenHeader title={title} subtitle={subtitle} backTo="/" backLabel="Volver al inicio" hideBackOnDesktop />
      {allowed ? (
        <div className="flex flex-col gap-4 px-4 py-4 lg:gap-5 lg:px-10 lg:py-8">{children}</div>
      ) : (
        <div className="px-4 py-6 lg:px-10 lg:py-8">
          <Card className="flex max-w-xl flex-col gap-3 p-5">
            <h2 className="text-heading font-bold">Acceso no permitido</h2>
            <p className="text-body text-neutral-text-secondary">
              Esta sección es solo para quien tiene el rol correspondiente en este campus. Si lo
              necesitas, pídeselo a un Admin del campus.
            </p>
            <ButtonLink to="/" variant="secondary" className="w-fit px-5">
              Ir al inicio
            </ButtonLink>
          </Card>
        </div>
      )}
    </>
  )
}

// Error of the last action of a form, announced to screen readers.
export function ActionError({ result }: { result: ActionResult | undefined }) {
  if (!result || result.ok) return null
  return (
    <Notice tone="error" className="text-body">
      {result.error}
    </Notice>
  )
}
