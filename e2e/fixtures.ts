import { test as base, type Page } from '@playwright/test'
import { API_PORT, CREDENTIAL_PREFIX, DB_COOKIE, EMAIL } from './seed'

export { expect } from '@playwright/test'

const API = `http://localhost:${API_PORT}`

type Options = {
  // Account signed in before the test starts; null for no session. Change it per file or per
  // describe with `test.use({ account: EMAIL.admin })`.
  account: string | null
  // Replace Google's button with a stand-in that signs in as `googleAccount` (the real one needs
  // a Google account). Off to test what happens when Google does not load.
  fakeGoogle: boolean
}

type Fixtures = { database: string }

// Stand-in for Google Identity Services (lib/google.ts uses window.google when it exists). Its
// button answers like the real one, with a credential the test API accepts (tests/e2e-server.ts).
function installFakeGoogle(prefix: string) {
  type Config = { callback: (response: { credential: string }) => void }
  let config: Config | undefined
  ;(window as unknown as { google: unknown }).google = {
    accounts: {
      id: {
        initialize: (c: Config) => {
          config = c
        },
        renderButton: (parent: HTMLElement) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = 'Continuar con Google'
          button.onclick = () => {
            const email = sessionStorage.getItem('e2e-google-account') ?? 'laura.martinez@uabc.edu.mx'
            config?.callback({ credential: prefix + email })
          }
          parent.replaceChildren(button)
        },
      },
    },
  }
}

// Signs in through the API, as the GIS button would (SDD 8.1). The page shares the cookies.
export async function signIn(page: Page, email: string) {
  const response = await page.request.post('/api/auth/google', {
    data: { credential: CREDENTIAL_PREFIX + email },
  })
  if (!response.ok()) throw new Error(`Sign-in failed for ${email}: ${response.status()}`)
}

// The Google account the stand-in button signs in with, for the next page load.
export async function chooseGoogleAccount(page: Page, email: string) {
  await page.addInitScript((value) => sessionStorage.setItem('e2e-google-account', value), email)
}

export const test = base.extend<Options & Fixtures>({
  account: [EMAIL.staff, { option: true }],
  fakeGoogle: [true, { option: true }],

  // Every test starts from its own copy of the seeded database, so tests can change data and
  // still run in parallel.
  database: [
    async ({ context, baseURL }, provide) => {
      const response = await fetch(`${API}/__e2e/databases`, { method: 'POST' })
      const { id } = (await response.json()) as { id: string }
      await context.addCookies([{ name: DB_COOKIE, value: id, url: baseURL! }])
      await provide(id)
      await fetch(`${API}/__e2e/databases/${id}`, { method: 'DELETE' })
    },
    { auto: true },
  ],

  page: async ({ page, account, fakeGoogle, database }, provide) => {
    void database
    if (fakeGoogle) await page.addInitScript(installFakeGoogle, CREDENTIAL_PREFIX)
    if (account) await signIn(page, account)
    await provide(page)
  },
})
