import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, expectNoHorizontalScroll, signInAs, signOut } from './helpers'

test.describe('sign in (/ingresar)', () => {
  test('RF-ACCESO-01: without a session every screen goes to /ingresar', async ({ page }) => {
    await signOut(page)
    await page.goto('/reportes?estado=open')

    await expect(page).toHaveURL(/\/ingresar\?next=%2Freportes%3Festado%3Dopen$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Inicia sesión' })).toBeVisible()
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('RF-GESTION-21: after signing in it opens the address it was going to', async ({ page }) => {
    await signInAs(page, 'Encargado', '/reportes/r-2')
    await expect(page).toHaveURL(/\/reportes\/r-2$/)
  })

  test('SDD 8.1: "next" only takes internal paths', async ({ page }) => {
    await signInAs(page, 'Encargado', '//example.com')
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/)
  })

  test('RF-ACCESO-02: shows the notice for an account of another domain', async ({ page }) => {
    await signOut(page)
    await page.goto('/ingresar?error=dominio')
    await expect(page.getByRole('alert')).toHaveText(/Solo se permiten cuentas @uabc\.edu\.mx/)
  })

  test('with a session, /ingresar goes on to the app', async ({ page }) => {
    await page.goto('/ingresar')
    await expect(page).toHaveURL(/\/$/)
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

  test('RF-REPORTE-11: opened without a session, it signs in and then preselects', async ({ page }) => {
    await signInAs(page, 'Encargado', '/e/K7P2X9QM4A')

    await expect(page).toHaveURL(/\/reportar\?/)
    await expect(page.getByLabel('Espacio')).toHaveValue('Salón 204')
  })
})
