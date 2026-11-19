import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, expectNoHorizontalScroll } from './helpers'

test.describe('report list (/reportes)', () => {
  test('is accessible and fits the screen', async ({ page }) => {
    await page.goto('/reportes')
    await expect(page.getByRole('heading', { name: 'Reportes · Campus Sauzal' })).toBeVisible()
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('filters by building and keeps the filter in the URL', async ({ page }) => {
    await page.goto('/reportes')
    await page.getByLabel('Edificio').selectOption('Biblioteca')

    await expect(page).toHaveURL(/edificio=Biblioteca/)
    await expect(page.getByRole('heading', { name: 'Abiertos · 0' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Biblioteca · Planta baja' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Edificio 5/ })).toHaveCount(0)
  })

  test('"Asignados a mí" shows only reports assigned to the current account', async ({ page }) => {
    await page.goto('/reportes')
    const toggle = page.getByRole('button', { name: 'Asignados a mí' })
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Abiertos · 1' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edificio 2 · Laboratorio 3' })).toBeVisible()
  })
})

test.describe('assign and resolve (/reportes/:id)', () => {
  test('RF-GESTION-07/08: assigning a Nuevo report moves it to En revisión', async ({ page }) => {
    await page.goto('/reportes/r-1')
    await expect(page.getByText('Nuevo', { exact: true })).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByRole('link', { name: 'Asignar' }).click()
    const sheet = page.getByRole('dialog', { name: 'Asignar reporte' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('radio', { name: 'Asignármelo a mí' })).toBeChecked()
    await expectNoA11yViolations(page)

    await sheet.getByRole('button', { name: 'Asignar' }).click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/\/reportes\/r-1$/)
    await expect(page.getByText('En revisión', { exact: true })).toBeVisible()
    await expect(page.getByRole('definition').filter({ hasText: /^Tú$/ })).toBeVisible()
  })

  test('closing the sheet with Escape leaves the report unchanged', async ({ page }) => {
    await page.goto('/reportes/r-1/asignar')
    await expect(page.getByRole('dialog', { name: 'Asignar reporte' })).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page).toHaveURL(/\/reportes\/r-1$/)
    await expect(page.getByRole('definition').filter({ hasText: /^Sin asignar$/ })).toBeVisible()
  })

  test('only the assigned person can resolve', async ({ page }) => {
    // r-4 is assigned to someone else.
    await page.goto('/reportes/r-4')
    await expect(page.getByRole('button', { name: 'Marcar como resuelto' })).toBeDisabled()

    // r-2 is assigned to the current account.
    await page.goto('/reportes/r-2')
    await page.getByRole('button', { name: 'Marcar como resuelto' }).click()
    // RF-GESTION-02: a resolved report shows its resolution date.
    await expect(page.getByRole('term').filter({ hasText: /^Resuelto$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Marcar como resuelto' })).toHaveCount(0)
  })

  test('an unknown report shows a not-found message', async ({ page }) => {
    await page.goto('/reportes/no-existe')
    await expect(page.getByRole('heading', { name: 'No encontrado' })).toBeVisible()
    await expect(page.getByText('Este reporte no existe o ya no está disponible.')).toBeVisible()
  })
})
