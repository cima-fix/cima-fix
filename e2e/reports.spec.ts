import { expect, test, type Page } from '@playwright/test'
import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  isDesktop,
  listedReportIds,
} from './helpers'

// The account of the demo session (Figma's Encargado).
const ME = 'laura.martinez@uabc.edu.mx'

function listHeading(page: Page) {
  return page.getByRole('heading', {
    level: 1,
    name: isDesktop(page) ? 'Reportes' : 'Reportes · Campus Sauzal',
  })
}

// "Asignado a" of the detail: "Tú" on phones, the email with "(tú)" on desktop.
function assignedToMe(page: Page) {
  return page
    .getByRole('definition')
    .filter({ hasText: isDesktop(page) ? `${ME} (tú)` : /^Tú$/ })
}

test.describe('report list (/reportes)', () => {
  test('is accessible and fits the screen', async ({ page }) => {
    await page.goto('/reportes')
    await expect(listHeading(page)).toBeVisible()
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('RF-GESTION-14: open first, then higher priority, then oldest', async ({ page }) => {
    await page.goto('/reportes')
    await expect(listHeading(page)).toBeVisible()

    expect(await listedReportIds(page)).toEqual([
      'r-3', // Alta, 10 nov
      'r-1', // Alta, 16 nov
      'r-2', // Media, 12 nov
      'r-4', // Media, 13 nov
      'r-6', // Media, 17 nov
      'r-5', // Resuelto
    ])
  })

  test('filters by building and keeps the filter in the URL', async ({ page }) => {
    await page.goto('/reportes')
    await page.getByLabel('Edificio').selectOption('Biblioteca')

    await expect(page).toHaveURL(/edificio=Biblioteca/)
    await expect.poll(() => listedReportIds(page)).toEqual(['r-5'])
  })

  test('"Asignados a mí" shows only reports assigned to the current account', async ({ page }) => {
    await page.goto('/reportes')
    const toggle = page.getByRole('button', { name: 'Asignados a mí' })
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => listedReportIds(page)).toEqual(['r-2'])
  })

  test('desktop: "Todos" clears "Asignados a mí" and "Mis reportes"', async ({ page }) => {
    test.skip(!isDesktop(page), 'desktop filter bar')
    await page.goto('/reportes?mios=1')
    const all = page.getByRole('button', { name: 'Todos' })
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await all.click()
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => listedReportIds(page)).toHaveLength(6)
  })
})

test.describe('assign, resolve and cancel (/reportes/:id)', () => {
  test('RF-GESTION-07/08: assigning a Nuevo report moves it to En revisión', async ({ page }) => {
    await page.goto('/reportes/r-1')
    await expect(page.getByText('Nuevo', { exact: true })).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByRole('link', { name: 'Asignar a…' }).click()
    const sheet = page.getByRole('dialog', { name: 'Asignar reporte' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('radio', { name: isDesktop(page) ? ME : 'Asignármelo a mí' })).toBeChecked()
    await expectNoA11yViolations(page)

    await sheet.getByRole('button', { name: isDesktop(page) ? 'Confirmar asignación' : 'Asignar' }).click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(/\/reportes\/r-1$/)
    await expect(page.getByText('En revisión', { exact: true })).toBeVisible()
    await expect(assignedToMe(page)).toBeVisible()
  })

  test('"Asignarme este reporte" takes a Nuevo report in one step', async ({ page }) => {
    await page.goto('/reportes/r-3')
    await page.getByRole('button', { name: 'Asignarme este reporte' }).click()
    await expect(page.getByText('En revisión', { exact: true })).toBeVisible()
    await expect(assignedToMe(page)).toBeVisible()
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

  test('cancelling asks first, and "No, volver" keeps the report', async ({ page }) => {
    await page.goto('/reportes/r-1')
    await page.getByRole('button', { name: 'Cancelar reporte' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Cancelar este reporte?' })
    await expect(dialog).toBeVisible()
    await expectNoA11yViolations(page)

    await dialog.getByRole('button', { name: 'No, volver' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Nuevo', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Cancelar reporte' }).click()
    await dialog.getByRole('button', { name: 'Sí, cancelar reporte' }).click()
    await expect(page.getByText('Cancelado', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancelar reporte' })).toHaveCount(0)
  })

  test('"Resolver" on a list card resolves the report', async ({ page }) => {
    test.skip(isDesktop(page), 'the desktop table has no row actions (Figma)')
    await page.goto('/reportes')
    const card = page.getByRole('article').filter({ hasText: 'Laboratorio 3' })
    await card.getByRole('button', { name: 'Resolver' }).click()

    await expect(card.getByText('Resuelto', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Abiertos · 4' })).toBeVisible()
  })

  test('an unknown report shows a not-found message', async ({ page }) => {
    await page.goto('/reportes/no-existe')
    await expect(page.getByRole('heading', { name: 'No encontrado' })).toBeVisible()
    await expect(page.getByText('Este reporte no existe o ya no está disponible.')).toBeVisible()
  })
})
