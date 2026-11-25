import { useEffect, useRef, useState } from 'react'
import { useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router'
import { Notice } from '../../components/ui/Notice'
import { CheckIcon } from '../../components/ui/icons'
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from '../../lib/google'
import type { SignInResult, signInLoader } from './data'

const POINTS = [
  'Reporta un problema del campus en menos de un minuto.',
  'Confirma los reportes que ya existen en vez de duplicarlos.',
  'Sigue en qué va cada reporte y quién lo atiende.',
]

// SDD 12: what the screen says when Google cannot be reached.
const UNAVAILABLE = 'La verificación de identidad no está disponible. Inténtalo más tarde.'

// The GIS button: Google draws it and calls back with the credential (SDD 8.1).
function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>(
    GOOGLE_CLIENT_ID ? 'loading' : 'unavailable',
  )

  useEffect(() => {
    callback.current = onCredential
  })

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let active = true
    loadGoogleIdentity()
      .then((google) => {
        if (!active || !container.current) return
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: ({ credential }) => callback.current(credential),
          hd: 'uabc.edu.mx',
          ux_mode: 'popup',
        })
        google.accounts.id.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          locale: 'es',
          width: Math.min(container.current.clientWidth || 384, 400),
        })
        setState('ready')
      })
      .catch(() => {
        if (active) setState('unavailable')
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {state === 'unavailable' && (
        <Notice tone="warning" className="text-body">
          {UNAVAILABLE}
        </Notice>
      )}
      {state === 'loading' && (
        <p role="status" className="text-body text-neutral-text-muted">
          Cargando el inicio de sesión de Google…
        </p>
      )}
      <div ref={container} className="flex min-h-11 justify-center" />
    </div>
  )
}

// /ingresar — sign in with the institutional Google account (SDD 13.2, 8.1).
// Phone: green band with the name and the card below. Desktop: brand panel on the left and the
// card on the gray canvas of the "· Escritorio" frames.
export function SignInPage() {
  const { next } = useLoaderData<typeof signInLoader>()
  const result = useActionData<SignInResult>()
  const navigation = useNavigation()
  const submit = useSubmit()
  const busy = navigation.state !== 'idle'

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:bg-canvas">
      <header className="flex flex-col gap-2 bg-green px-5 pt-10 pb-8 text-neutral-white lg:justify-between lg:px-14 lg:py-14">
        <div className="flex flex-col gap-2">
          <p className="text-[28px] leading-tight font-bold lg:text-[40px]">Cima Fix</p>
          <p className="text-body text-neutral-white/90 lg:text-base">
            Mantenimiento e infraestructura · UABC
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

          {/* DOMAIN_NOT_ALLOWED, IDENTITY_UNAVAILABLE…: the API's own message (SDD 13.1). */}
          {result?.error && !busy && (
            <Notice
              tone={result.error.code === 'IDENTITY_UNAVAILABLE' ? 'warning' : 'error'}
              className="text-body"
            >
              {result.error.message}
            </Notice>
          )}

          <GoogleButton
            onCredential={(credential) => submit({ credential, next }, { method: 'post' })}
          />
          {busy && (
            <p role="status" className="text-center text-body text-neutral-text-muted">
              Entrando…
            </p>
          )}

          <p className="text-xs text-neutral-text-muted">
            Solo se aceptan cuentas del dominio @uabc.edu.mx. Si es tu primera vez, entrarás como
            Reportante hasta que un Admin te asigne otro rol.
          </p>
        </div>
      </main>
    </div>
  )
}
