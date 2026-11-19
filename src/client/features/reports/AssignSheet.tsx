import { useEffect, useRef, useState } from 'react'
import { Form, useNavigate, useNavigation, useRouteLoaderData } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { CheckIcon } from '../../components/ui/icons'
import { cn } from '../../lib/cn'
import { CURRENT_USER } from '../../lib/demo-api'
import type { reportDetailLoader } from './data'

// /reportes/:id/asignar — Figma frame C "Asignar reporte", a bottom sheet over the detail.
export function AssignSheet() {
  const loaded = useRouteLoaderData<typeof reportDetailLoader>('report')
  const navigate = useNavigate()
  const navigation = useNavigation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [assignee, setAssignee] = useState(CURRENT_USER)

  // Native modal dialog: traps focus, closes with Esc and restores focus (SDD 13.5).
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  if (!loaded) return null
  const { report, staff } = loaded
  const options = [CURRENT_USER, ...staff.filter((email) => email !== CURRENT_USER)]
  const close = () => navigate(`/reportes/${report.id}`, { replace: true })

  return (
    <dialog
      ref={dialog}
      aria-labelledby="assign-title"
      onClose={close}
      className="mx-auto mt-auto mb-0 w-full max-w-md rounded-t-screen bg-neutral-white p-0 text-neutral-text backdrop:bg-neutral-black/50"
    >
      <Form method="post" className="flex flex-col gap-3 px-4 pt-5 pb-6">
        <input type="hidden" name="intent" value="assign" />
        <div className="flex flex-col gap-1">
          <h2 id="assign-title" className="text-base font-medium">
            Asignar reporte
          </h2>
          <p className="text-xs text-neutral-text-muted">Solo encargados del {report.campus}.</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Persona encargada</legend>
          {options.map((email) => {
            const checked = assignee === email
            return (
              <label
                key={email}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-3 text-body has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-green',
                  checked
                    ? 'border-[1.5px] border-green bg-green-surface font-medium'
                    : 'border-neutral-border',
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
                {email === CURRENT_USER ? 'Asignármelo a mí' : email}
                {email === report.assignee && (
                  <span className="ml-auto text-xs text-neutral-text-muted">Actual</span>
                )}
              </label>
            )
          })}
        </fieldset>

        <Notice tone="info">
          Al asignar, el reporte pasa a En revisión y la persona recibe un correo.
        </Notice>

        <Button type="submit" disabled={navigation.state === 'submitting' || assignee === report.assignee}>
          Asignar
        </Button>
        <Button variant="secondary" onClick={close}>
          Cancelar
        </Button>
      </Form>
    </dialog>
  )
}
