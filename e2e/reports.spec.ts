import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  isDesktop,
  listedReportIds,
} from './helpers'
import { CAMPUS, EMAIL, REPORT } from './seed'

function listHeading(page: Page) {
  return page.getByRole('heading', {
    level: 1,
    name: isDesktop(page) ? 'Reportes' : `Reportes · ${CAMPUS.name}`,
  })
}

// "Asignado a" of the detail: "Tú" on phones, the email with "(tú)" on desktop.
function assignedToMe(page: Page) {
  return page
    .getByRole('definition')
    .filter({ hasText: isDesktop(page) ? `${EMAIL.staff} (tú)` : /^Tú$/ })
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

    await expect.poll(() => listedReportIds(page)).toEqual([
      REPORT.r3, // Alta, 10 nov
      REPORT.r1, // Alta, 16 nov
      REPORT.r2, // Media, 12 nov
      REPORT.r4, // Media, 13 nov
      REPORT.r6, // Media, 17 nov
      REPORT.r5, // Resuelto
    ])
  })

  test('RF-GESTION-03, 04: filters by building and keeps the filter in the URL', async ({ page }) => {
    await page.goto('/reportes')
    await page.getByLabel('Edificio').selectOption({ label: 'Biblioteca' })

    await expect(page).toHaveURL(/edificio=/)
    await expect.poll(() => listedReportIds(page)).toEqual([REPORT.r5])
  })

  test('RF-GESTION-22: "Asignados a mí" shows only reports assigned to the account', async ({ page }) => {
    await page.goto('/reportes')
    const toggle = page.getByRole('button', { name: 'Asignados a mí' })
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => listedReportIds(page)).toEqual([REPORT.r2])
  })

  test('RF-GESTION-15: "Mis reportes" shows the ones registered or confirmed', async ({ page }) => {
    await page.goto('/reportes?mios=1')
    await expect.poll(() => listedReportIds(page)).toEqual([REPORT.r4, REPORT.r6, REPORT.r5])
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
    await page.goto(`/reportes/${REPORT.r1}`)
    await expect(page.getByText('Nuevo', { exact: true })).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByRole('link', { name: 'Asignar a…' }).click()
    const sheet = page.getByRole('dialog', { name: 'Asignar reporte' })
    await expect(sheet).toBeVisible()
    await expect(
      sheet.getByRole('radio', { name: isDesktop(page) ? EMAIL.staff : 'Asignármelo a mí' }),
    ).toBeChecked()
    await expectNoA11yViolations(page)

    await sheet.getByRole('button', { name: isDesktop(page) ? 'Confirmar asignación' : 'Asignar' }).click()
    await expect(sheet).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`/reportes/${REPORT.r1}$`))
    await expect(page.getByText('En revisión', { exact: true })).toBeVisible()
    await expect(assignedToMe(page)).toBeVisible()
  })

  test('"Asignarme este reporte" takes a Nuevo report in one step', async ({ page }) => {
    await page.goto(`/reportes/${REPORT.r3}`)
    await page.getByRole('button', { name: 'Asignarme este reporte' }).click()
    await expect(page.getByText('En revisión', { exact: true })).toBeVisible()
    await expect(assignedToMe(page)).toBeVisible()
  })

  test('closing the sheet with Escape leaves the report unchanged', async ({ page }) => {
    await page.goto(`/reportes/${REPORT.r1}/asignar`)
    await expect(page.getByRole('dialog', { name: 'Asignar reporte' })).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page).toHaveURL(new RegExp(`/reportes/${REPORT.r1}$`))
    await expect(page.getByRole('definition').filter({ hasText: /^Sin asignar$/ })).toBeVisible()
  })

  test('RN-03: only the assigned person can resolve', async ({ page }) => {
    // r4 is assigned to someone else.
    await page.goto(`/reportes/${REPORT.r4}`)
    await expect(page.getByText('En revisión', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Marcar como resuelto' })).toHaveCount(0)

    // r2 is assigned to the account.
    await page.goto(`/reportes/${REPORT.r2}`)
    await page.getByRole('button', { name: 'Marcar como resuelto' }).click()
    // RF-GESTION-02: a resolved report shows its resolution date.
    await expect(page.getByRole('term').filter({ hasText: /^Resuelto$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Marcar como resuelto' })).toHaveCount(0)
  })

  test('cancelling asks first, and "No, volver" keeps the report', async ({ page }) => {
    await page.goto(`/reportes/${REPORT.r1}`)
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
  })

  test('RF-GESTION-19: an unknown report shows that it is not available', async ({ page }) => {
    await page.goto('/reportes/no-existe')
    await expect(page.getByRole('heading', { name: 'No encontrado' })).toBeVisible()
    await expect(page.getByText('El reporte no está disponible.')).toBeVisible()
  })
})

test.describe('a Reportante', () => {
  test.use({ account: EMAIL.ana })

  test('RN-04: does not see the emails nor the management actions', async ({ page }) => {
    await page.goto(`/reportes/${REPORT.r1}`)
    await expect(page.getByText('Nuevo', { exact: true })).toBeVisible()
    await expect(page.getByRole('term').filter({ hasText: /^(Reportó|Asignado a)$/ })).toHaveCount(0)
    await expect(page.locator('dl').getByText(EMAIL.ana)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Asignar a…' })).toHaveCount(0)
  })
})
