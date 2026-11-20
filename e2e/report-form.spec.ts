import { expect, test, type Page } from '@playwright/test'
import { expectNoA11yViolations, expectNoHorizontalScroll } from './helpers'

const MB = 1024 * 1024

function image(name: string, bytes = 16) {
  return { name, mimeType: 'image/png', buffer: Buffer.alloc(bytes) }
}

async function fillValidReport(page: Page, description: string) {
  await page.getByLabel('Edificio').selectOption('Biblioteca')
  await page.getByLabel('Espacio').selectOption('Planta alta')
  await page.getByLabel('Categoría').selectOption('Mobiliario')
  await page.getByLabel('Descripción').fill(description)
}

async function fillDuplicateOfSalon204(page: Page) {
  await page.getByLabel('Edificio').selectOption('Edificio 5')
  await page.getByLabel('Espacio').selectOption('Salón 204')
  await page.getByLabel('Categoría').selectOption('Iluminación')
  await page.getByLabel('Descripción').fill('La lámpara de la izquierda no prende.')
  await page.getByRole('button', { name: 'Enviar reporte' }).click()
  await expect(page.getByRole('heading', { name: '¿Es el mismo problema?' })).toBeVisible()
}

test.describe('report form (/reportar)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reportar')
    await expect(page.getByRole('heading', { name: 'Nuevo reporte' })).toBeVisible()
  })

  test('is accessible and fits the screen', async ({ page }) => {
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('RNF-USABILIDAD-05: shows required-field errors linked to each field', async ({ page }) => {
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

  test('RF-REPORTE-02: accepts exactly 1,000 characters', async ({ page }) => {
    await fillValidReport(page, 'a'.repeat(1000))
    await expect(page.getByText('1,000 / 1,000')).toBeVisible()
    await page.getByRole('button', { name: 'Enviar reporte' }).click()
    await expect(page.getByRole('heading', { name: 'Listo, registramos tu reporte' })).toBeVisible()
  })

  test('RF-REPORTE-02: rejects more than 1,000 characters', async ({ page }) => {
    await fillValidReport(page, 'a'.repeat(1024))
    await page.getByRole('button', { name: 'Enviar reporte' }).click()
    await expect(page.getByText('Pasaste el límite: 1,024 de 1,000 caracteres.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Listo, registramos tu reporte' })).toHaveCount(0)
  })

  test('SDD 10.8: counts the description in code points', async ({ page }) => {
    await page.getByLabel('Descripción').fill('💡'.repeat(1000))
    await expect(page.getByText('1,000 / 1,000')).toBeVisible()
  })

  test('RF-REPORTE-09: rejects a file that is not an image', async ({ page }) => {
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

  test('RF-REPORTE-04: accepts a 10 MB photo and rejects a bigger one', async ({ page }) => {
    await page.getByLabel('Agregar foto').setInputFiles([
      image('justa.png', 10 * MB),
      image('grande.png', 10 * MB + 1),
    ])

    await expect(page.getByRole('button', { name: 'Quitar justa.png' })).toBeVisible()
    await expect(page.getByText(/justa\.png (pesa|no es)/)).toHaveCount(0)
    await expect(
      page.getByText('grande.png pesa más de 10 MB. Elige una foto más ligera.'),
    ).toBeVisible()
  })

  test('RF-REPORTE-03: does not allow a fourth photo and says why', async ({ page }) => {
    await page
      .getByLabel('Agregar foto')
      .setInputFiles([image('a.png'), image('b.png'), image('c.png'), image('d.png')])

    await expect(page.getByRole('button', { name: /^Quitar / })).toHaveCount(3)
    await expect(page.getByText('Solo se pueden adjuntar 3 fotos. No se agregó: d.png.')).toBeVisible()
    await expect(page.getByLabel('Agregar foto')).toHaveCount(0)
  })

  test('RF-REPORTE-14: registers a report without duplicates and shows it', async ({ page }) => {
    await fillValidReport(page, 'Hay una silla rota junto a la ventana.')
    await page.getByRole('button', { name: 'Enviar reporte' }).click()

    await expect(page.getByRole('heading', { name: 'Listo, registramos tu reporte' })).toBeFocused()
    await expect(page.getByText('Planta alta · Mobiliario')).toBeVisible()
    await expect(page.getByText('Nuevo', { exact: true })).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByRole('button', { name: 'Hacer otro reporte' }).click()
    await expect(page.getByLabel('Descripción')).toHaveValue('')
  })

  test('RF-DUPLICADO-07: possible duplicates follow the RF-GESTION-14 order', async ({ page }) => {
    await fillDuplicateOfSalon204(page)

    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(4)
    // Alta (10 nov), Alta (16 nov), Media (13 nov), Media (17 nov).
    await expect(cards.nth(0)).toContainText('La lámpara del fondo no enciende desde el lunes.')
    await expect(cards.nth(1)).toContainText('No enciende la lámpara de la izquierda.')
    await expect(cards.nth(2)).toContainText('Parpadea la luz del pizarrón.')
    await expect(cards.nth(3)).toContainText('El apagador de la entrada no funciona.')
    await expectNoA11yViolations(page)
  })

  test('RF-DUPLICADO-05: own and already confirmed reports have no confirm button', async ({
    page,
  }) => {
    await fillDuplicateOfSalon204(page)

    const confirmed = page.getByRole('article').filter({ hasText: 'Parpadea la luz del pizarrón.' })
    await expect(confirmed.getByText('Ya lo confirmaste')).toBeVisible()
    await expect(confirmed.getByRole('button')).toHaveCount(0)

    const own = page.getByRole('article').filter({ hasText: 'El apagador de la entrada' })
    await expect(own.getByText('Tú registraste este reporte')).toBeVisible()
    await expect(own.getByRole('button')).toHaveCount(0)
  })

  test('RF-DUPLICADO-03: confirming a duplicate opens it instead of creating a report', async ({
    page,
  }) => {
    await fillDuplicateOfSalon204(page)

    const first = page.getByRole('article').first()
    await first.getByRole('button', { name: 'Es el mismo problema' }).click()

    // r-3 had 4 confirmations.
    await expect(page).toHaveURL(/\/reportes\/r-3$/)
    await expect(page.getByRole('definition').filter({ hasText: /^5$/ })).toBeVisible()
  })
})
