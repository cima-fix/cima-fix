import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, expectNoHorizontalScroll } from './helpers'

test.describe('report form (/reportar)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reportar')
    await expect(page.getByRole('heading', { name: 'Nuevo reporte' })).toBeVisible()
  })

  test('is accessible and fits the screen', async ({ page }) => {
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('shows required-field errors linked to each field', async ({ page }) => {
    await page.getByRole('button', { name: 'Enviar reporte' }).click()

    const space = page.getByLabel('Espacio')
    await expect(space).toHaveAttribute('aria-invalid', 'true')
    await expect(space).toHaveAccessibleDescription(/Elige un espacio para continuar\./)
    await expect(page.getByLabel('Descripción')).toHaveAccessibleDescription(
      /Cuéntanos qué pasa para continuar\./,
    )
    await expectNoA11yViolations(page)
  })

  test('RF-REPORTE-12: choosing a building filters the spaces', async ({ page }) => {
    const space = page.getByLabel('Espacio')
    await expect(space).toBeDisabled()

    await page.getByLabel('Edificio').selectOption('Biblioteca')
    await expect(space).toBeEnabled()
    await expect(space.locator('option')).toHaveText(['Elige un espacio', 'Planta baja', 'Planta alta'])
  })

  test('rejects a description over 1,000 characters', async ({ page }) => {
    await page.getByLabel('Descripción').fill('a'.repeat(1024))
    await page.getByRole('button', { name: 'Enviar reporte' }).click()
    await expect(page.getByText('Pasaste el límite: 1,024 de 1,000 caracteres.')).toBeVisible()
  })

  test('RF-REPORTE-04: rejects a file that is not an image', async ({ page }) => {
    await page.getByLabel('Agregar foto').setInputFiles({
      name: 'informe.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    })
    await expect(
      page.getByText('informe.pdf no es una imagen. Usa JPG, PNG, WebP o HEIC.'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Quitar informe.pdf' }).click()
    await expect(page.getByText('informe.pdf no es una imagen.', { exact: false })).toHaveCount(0)
  })

  test('registers a report without duplicates and shows the confirmation', async ({ page }) => {
    await page.getByLabel('Edificio').selectOption('Biblioteca')
    await page.getByLabel('Espacio').selectOption('Planta alta')
    await page.getByLabel('Categoría').selectOption('Mobiliario')
    await page.getByLabel('Descripción').fill('Hay una silla rota junto a la ventana.')
    await page.getByRole('button', { name: 'Enviar reporte' }).click()

    await expect(page.getByRole('heading', { name: 'Listo, registramos tu reporte' })).toBeFocused()
    await expect(page.getByText('Planta alta · Mobiliario')).toBeVisible()
    await expect(page.getByText('Nuevo', { exact: true })).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByRole('button', { name: 'Hacer otro reporte' }).click()
    await expect(page.getByLabel('Descripción')).toHaveValue('')
  })

  test('RF-DUPLICADO-03: confirming a duplicate opens it instead of creating a report', async ({
    page,
  }) => {
    await page.getByLabel('Edificio').selectOption('Edificio 5')
    await page.getByLabel('Espacio').selectOption('Salón 204')
    await page.getByLabel('Categoría').selectOption('Iluminación')
    await page.getByLabel('Descripción').fill('La lámpara de la izquierda no prende.')
    await page.getByRole('button', { name: 'Enviar reporte' }).click()

    await expect(page.getByRole('heading', { name: '¿Es el mismo problema?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ya lo confirmaste' })).toBeDisabled()
    await expectNoA11yViolations(page)

    await page.getByRole('button', { name: 'Es el mismo problema' }).first().click()
    await expect(page).toHaveURL(/\/reportes\/r-1$/)
    await expect(page.getByRole('definition').filter({ hasText: /^7$/ })).toBeVisible()
  })
})
