import { chooseGoogleAccount, expect, test } from './fixtures'
import { expectNoA11yViolations, expectNoHorizontalScroll, isDesktop } from './helpers'
import { EMAIL } from './seed'

test.describe('sign in (/ingresar)', () => {
  test.use({ account: null })

  test('RF-ACCESO-01: without a session every screen goes to /ingresar', async ({ page }) => {
    await page.goto('/reportes?estado=new')

    await expect(page).toHaveURL(/\/ingresar\?next=%2Freportes%3Festado%3Dnew$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Inicia sesión' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('SDD 8.1: signing in with Google opens the address it was going to', async ({ page }) => {
    await page.goto('/mapa')
    await page.getByRole('button', { name: 'Continuar con Google' }).click()

    await expect(page).toHaveURL(/\/mapa$/)
    await expect(page.getByRole('heading', { level: 1, name: /Mapa/ })).toBeVisible()
  })

  test('SDD 8.1: "next" only takes internal paths', async ({ page }) => {
    await page.goto('/ingresar?next=%2F%2Fexample.com')
    await page.getByRole('button', { name: 'Continuar con Google' }).click()
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/)
  })

  test('RF-ACCESO-02: an account of another domain is rejected', async ({ page }) => {
    await chooseGoogleAccount(page, 'alguien@gmail.com')
    await page.goto('/ingresar')
    await page.getByRole('button', { name: 'Continuar con Google' }).click()

    await expect(page.getByRole('alert')).toHaveText('Solo puedes iniciar sesión con una cuenta @uabc.edu.mx.')
    await expect(page).toHaveURL(/\/ingresar/)
  })

  test('RNF-DISPONIBILIDAD-01: Google unavailable while verifying', async ({ page }) => {
    await chooseGoogleAccount(page, 'down')
    await page.goto('/ingresar')
    await page.getByRole('button', { name: 'Continuar con Google' }).click()

    await expect(page.getByRole('alert')).toHaveText(
      'La verificación de identidad no está disponible. Inténtalo más tarde.',
    )
  })
})

test.describe('Google does not load', () => {
  test.use({ account: null, fakeGoogle: false })

  test('SDD 12: the screen says the verification is unavailable', async ({ page }) => {
    await page.route('https://accounts.google.com/**', (route) => route.abort())
    await page.goto('/ingresar')
    await expect(page.getByRole('alert')).toHaveText(
      'La verificación de identidad no está disponible. Inténtalo más tarde.',
    )
  })
})

test.describe('with a session', () => {
  test('/ingresar goes on to the app', async ({ page }) => {
    await page.goto('/ingresar')
    await expect(page).toHaveURL(/\/$/)
  })

  test('RF-ACCESO-03, 04: the menu shows the role of the account in the campus', async ({ page }) => {
    await page.goto('/')
    const role = isDesktop(page)
      ? page.getByRole('complementary').getByText('Tú · Encargado')
      : page.getByText(`${EMAIL.staff} · Encargado`)
    await expect(role).toBeVisible()
  })

  test('RF-ACCESO-14: "Cerrar sesión" ends the session', async ({ page }) => {
    await page.goto('/')
    const signOut = isDesktop(page)
      ? page.getByRole('complementary').getByRole('button', { name: 'Cerrar sesión' })
      : page.getByRole('button', { name: 'Cerrar sesión' })
    await signOut.click()

    await expect(page).toHaveURL(/\/ingresar$/)
    await page.goto('/reportes')
    await expect(page).toHaveURL(/\/ingresar\?next=/)
  })
})

test.describe('a Reportante', () => {
  test.use({ account: EMAIL.ana })

  test('RF-ACCESO-03: has no management screens', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Personal' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Catálogo' })).toHaveCount(0)
  })
})

test.describe('space link (/e/:code)', () => {
  test('RF-REPORTE-05: preselects campus, building and space', async ({ page }) => {
    await page.goto('/e/K7P2X9QM4A')

    await expect(page.getByRole('heading', { name: 'Nuevo reporte' })).toBeVisible()
    await expect(page.getByLabel('Edificio')).toHaveValue('Edificio 5')
    await expect(page.getByLabel('Espacio')).toHaveValue('Salón 204')
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('RF-REPORTE-10: a deactivated space keeps only what is offered', async ({ page }) => {
    await page.goto('/e/B6YP2ZR8MT')

    await expect(page.getByRole('alert')).toHaveText(/no está disponible/)
    await expect(page.getByLabel('Edificio')).toHaveValue('Edificio 2')
    await expect(page.getByLabel('Espacio')).toHaveValue('')
    await expectNoA11yViolations(page)
  })

  test('RF-REPORTE-10: an unknown code preselects nothing', async ({ page }) => {
    await page.goto('/e/ZZZZZZZZZZ')
    await expect(page.getByRole('alert')).toHaveText(/no está disponible/)
    await expect(page.getByLabel('Edificio')).toHaveValue('')
  })
})

test.describe('space link without a session', () => {
  test.use({ account: null })

  test('RF-REPORTE-11: signs in and then preselects', async ({ page }) => {
    await page.goto('/e/K7P2X9QM4A')
    await expect(page).toHaveURL(/\/ingresar\?next=%2Fe%2FK7P2X9QM4A$/)
    await page.getByRole('button', { name: 'Continuar con Google' }).click()

    await expect(page).toHaveURL(/\/reportar\?/)
    await expect(page.getByLabel('Espacio')).toHaveValue('Salón 204')
  })
})
