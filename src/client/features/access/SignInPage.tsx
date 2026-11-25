import { useState } from 'react'
import { Form, useLoaderData, useNavigation, useSearchParams } from 'react-router'
import { Notice } from '../../components/ui/Notice'
import { CheckIcon, GoogleIcon } from '../../components/ui/icons'
import { cn } from '../../lib/cn'
import { CAMPUS } from '../../lib/demo-api'
import type { signInLoader } from './data'

// Errors that come back from Google sign-in (SDD 8.1, RF-ACCESO-02, RNF-DISPONIBILIDAD-01).
const ERRORS = {
  dominio: {
    tone: 'error',
    text: 'Solo se permiten cuentas @uabc.edu.mx. Entra con tu cuenta institucional.',
  },
  verificacion: {
    tone: 'warning',
    text: 'No pudimos verificar tu cuenta con Google en este momento. Intenta de nuevo en unos minutos.',
  },
} as const

const ROLES = [
  { value: 'staff', label: 'Encargado' },
  { value: 'admin', label: 'Admin' },
] as const

const POINTS = [
  'Reporta un problema del campus en menos de un minuto.',
  'Confirma los reportes que ya existen en vez de duplicarlos.',
  'Sigue en qué va cada reporte y quién lo atiende.',
]

// /ingresar — sign in with the institutional Google account (SDD 13.2).
// Phone: green band with the name and the card below. Desktop: brand panel on the left and the
// card on the gray canvas of the "· Escritorio" frames.
export function SignInPage() {
  const { next } = useLoaderData<typeof signInLoader>()
  const [params] = useSearchParams()
  const navigation = useNavigation()
  const [role, setRole] = useState<'staff' | 'admin'>('staff')
  const error = ERRORS[params.get('error') as keyof typeof ERRORS]
  const busy = navigation.state !== 'idle'

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:bg-canvas">
      <header className="flex flex-col gap-2 bg-green px-5 pt-10 pb-8 text-neutral-white lg:justify-between lg:px-14 lg:py-14">
        <div className="flex flex-col gap-2">
          <p className="text-[28px] leading-tight font-bold lg:text-[40px]">Cima Fix</p>
          <p className="text-body text-neutral-white/90 lg:text-base">
            Mantenimiento e infraestructura · UABC {CAMPUS.name}
          </p>
        </div>
        <ul className="hidden flex-col gap-4 lg:flex">
          {POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3 text-base">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-green-dark">
                <CheckIcon className="size-3.5" strokeWidth={3} />
              </span>
              {point}
            </li>
          ))}
        </ul>
        <p className="hidden text-xs text-neutral-white lg:block">
          Universidad Autónoma de Baja California
        </p>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-6 lg:items-center lg:px-10">
        <div className="flex w-full max-w-md flex-col gap-4 lg:rounded-xl lg:border lg:border-card-border lg:bg-neutral-white lg:p-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-heading font-bold lg:text-[26px] lg:leading-tight">Inicia sesión</h1>
            <p className="text-body text-neutral-text-secondary">
              {next === '/'
                ? 'Usa tu cuenta institucional @uabc.edu.mx.'
                : 'Inicia sesión con tu cuenta @uabc.edu.mx para continuar.'}
            </p>
          </div>

          {error && (
            <Notice tone={error.tone} className="text-body">
              {error.text}
            </Notice>
          )}

          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="next" value={next} />

            {/* Demo only: there is no Google here, so the role is picked by hand. */}
            <fieldset className="flex flex-col gap-2 rounded-control border border-dashed border-neutral-border p-3">
              <legend className="px-1 text-xs text-neutral-text-muted">
                Demostración: entrar como
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((option) => {
                  const checked = role === option.value
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        'flex cursor-pointer items-center justify-center gap-2 rounded-control border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-green',
                        checked
                          ? 'border-green bg-green-surface font-semibold text-green-dark'
                          : 'border-neutral-border text-neutral-text-secondary',
                      )}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={option.value}
                        checked={checked}
                        onChange={() => setRole(option.value)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-control border border-neutral-field-border bg-neutral-white px-4 py-3 text-control font-medium text-neutral-text hover:bg-neutral-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon className="size-5" />
              {busy ? 'Entrando…' : 'Continuar con Google'}
            </button>
          </Form>

          <p className="text-xs text-neutral-text-muted">
            Solo se aceptan cuentas del dominio @uabc.edu.mx. Si es tu primera vez, entrarás como
            Reportante hasta que un Admin te asigne otro rol.
          </p>
        </div>
      </main>
    </div>
  )
}
