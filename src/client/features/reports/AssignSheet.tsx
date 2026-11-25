import { useState } from 'react'
import { Form, useNavigate, useNavigation, useRouteLoaderData } from 'react-router'
import { Chip } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Notice } from '../../components/ui/Notice'
import { ArrowLeftIcon, CheckIcon } from '../../components/ui/icons'
import { cn } from '../../lib/cn'
import { CURRENT_USER } from '../../lib/demo-api'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import type { reportDetailLoader } from './data'

// /reportes/:id/asignar — Figma frame C "Asignar reporte", a bottom sheet over the detail,
// and "Modal · Asignar reporte · Escritorio" from lg up.
export function AssignSheet() {
  const loaded = useRouteLoaderData<typeof reportDetailLoader>('report')
  const navigate = useNavigate()
  const navigation = useNavigation()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  // Only Encargados of the campus can receive a report; the current account first.
  const staff = loaded?.staff ?? []
  const options = staff.includes(CURRENT_USER)
    ? [CURRENT_USER, ...staff.filter((email) => email !== CURRENT_USER)]
    : staff
  const [assignee, setAssignee] = useState(loaded?.report.assignee ?? options[0] ?? '')

  if (!loaded) return null
  const { report } = loaded
  const close = () => navigate(`/reportes/${report.id}`, { replace: true })
  const submitting = navigation.state === 'submitting'

  return (
    <Dialog labelledBy="assign-title" onClose={close} variant="sheet">
      <Form method="post" className="flex flex-col gap-3 px-4 pt-5 pb-6 lg:px-6 lg:pt-6">
        <input type="hidden" name="intent" value="assign" />
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={close}
            aria-label="Volver al reporte"
            className="-m-1 rounded-control p-1 text-neutral-text focus-visible:outline-2 focus-visible:outline-green lg:hidden"
          >
            <ArrowLeftIcon className="size-5" />
          </button>
          <div className="flex flex-col gap-1">
            <h2 id="assign-title" className="text-base font-medium lg:text-heading lg:font-bold">
              Asignar reporte
            </h2>
            <p className="text-xs text-neutral-text-muted">
              Solo aparecen Encargados del {report.campus}.
            </p>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Persona encargada</legend>
          {options.map((email) => {
            const checked = assignee === email
            const mine = email === CURRENT_USER
            return (
              <label
                key={email}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-3 text-body has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-green',
                  checked
                    ? 'border-[1.5px] border-green bg-green-surface font-medium'
                    : 'border-neutral-border lg:border-card-border',
                )}
              >
                <input
                  type="radio"
                  name="assignee"
                  value={email}
                  checked={checked}
                  onChange={() => setAssignee(email)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-4.5 shrink-0 items-center justify-center rounded-full',
                    checked
                      ? 'bg-green text-neutral-white'
                      : 'border-[1.5px] border-neutral-text-secondary',
                  )}
                >
                  {checked && <CheckIcon className="size-3" strokeWidth={3} />}
                </span>
                {mine && !isDesktop ? 'Asignármelo a mí' : email}
                {mine && isDesktop && (
                  <span className="ml-auto">
                    <Chip tone="solid">Tú</Chip>
                  </span>
                )}
                {email === report.assignee && (
                  <span className={cn('text-xs text-neutral-text-muted', !(mine && isDesktop) && 'ml-auto')}>
                    Actual
                  </span>
                )}
              </label>
            )
          })}
        </fieldset>

        {!isDesktop && (
          <Notice tone="info">
            Al asignar, el reporte pasa a En revisión y la persona recibe un correo.
          </Notice>
        )}

        {isDesktop ? (
          <div className="mt-1 flex justify-end gap-2.5">
            <Button variant="secondary" onClick={close} className="w-auto px-5 py-2.5 text-sm">
              Volver
            </Button>
            <Button
              type="submit"
              disabled={submitting || assignee === report.assignee}
              className="w-auto px-5 py-2.5 text-sm"
            >
              Confirmar asignación
            </Button>
          </div>
        ) : (
          <>
            <Button type="submit" disabled={submitting || assignee === report.assignee}>
              Asignar
            </Button>
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
          </>
        )}
      </Form>
    </Dialog>
  )
}
