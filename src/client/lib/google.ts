// Google Identity Services (SDD 8.1, DD-05): the "Continuar con Google" button returns an ID
// token (credential) that the API verifies. Only the parts of the GIS API the SPA uses.

type CredentialResponse = { credential: string }

type IdConfiguration = {
  client_id: string
  callback: (response: CredentialResponse) => void
  // Hint for the account chooser; the API is what enforces the domain (DD-05).
  hd?: string
  ux_mode?: 'popup' | 'redirect'
}

type ButtonConfiguration = {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill'
  locale?: string
  width?: number
}

export type GoogleIdentity = {
  accounts: {
    id: {
      initialize(config: IdConfiguration): void
      renderButton(parent: HTMLElement, options: ButtonConfiguration): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

const SCRIPT = 'https://accounts.google.com/gsi/client'
const TIMEOUT_MS = 10_000

let loading: Promise<GoogleIdentity> | undefined

// Loads the GIS script once. Rejects when it does not load (SDD 12: "La verificación de
// identidad no está disponible").
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    const timer = setTimeout(() => reject(new Error('GIS timeout')), TIMEOUT_MS)
    script.onload = () => {
      clearTimeout(timer)
      if (window.google?.accounts?.id) resolve(window.google)
      else reject(new Error('GIS unavailable'))
    }
    script.onerror = () => {
      clearTimeout(timer)
      reject(new Error('GIS unavailable'))
    }
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    loading = undefined
    throw error
  })
  return loading
}

// Client ID of Cima Fix (SDD 15.2), empty when the environment does not set it.
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
