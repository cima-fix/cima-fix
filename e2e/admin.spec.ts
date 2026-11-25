import { expect, test } from './fixtures'
import { expectNoA11yViolations, expectNoHorizontalScroll } from './helpers'
import { EMAIL } from './seed'

const CATALOG = '/campus/sauzal/catalogo'
const STAFF = '/campus/sauzal/personal'
const SETTINGS = '/campus/sauzal/configuracion'

test.describe('as Encargado', () => {
  test('SDD 13.2: Catálogo and Configuración show "acceso no permitido"', async ({ page }) => {
    for (const path of [CATALOG, SETTINGS]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: 'Acceso no permitido' })).toBeVisible()
    }
    await expectNoA11yViolations(page)
  })

  test('RF-ACCESO-11, 12: Personal is read-only', async ({ page }) => {
    await page.goto(STAFF)
    await expect(page.getByText('Solo un Admin puede asignar o retirar roles en este campus.')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Administradores' }).getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('region', { name: 'Encargados' }).getByRole('listitem')).toHaveCount(4)
    await expect(page.getByText('Aún no ha iniciado sesión')).toBeVisible()
    await expect(page.getByRole('button', { name: /Retirar rol/ })).toHaveCount(0)
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('an unknown campus is not found', async ({ page }) => {
    await page.goto('/campus/otro/personal')
    await expect(page.getByRole('heading', { name: 'No encontrado' })).toBeVisible()
  })
})

test.describe('as Admin', () => {
  test.use({ account: EMAIL.admin })

  test('Catálogo: lists every building, space link and category', async ({ page }) => {
    await page.goto(CATALOG)
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible()
    // RF-CATALOGO-16: the link of each space; RF-CATALOGO-20: deactivated items too.
    await expect(page.getByRole('link', { name: '/e/K7P2X9QM4A' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Espacios de Edificio 2' })).toContainText('Salón 202')
    await expect(page.getByText('Jardinería')).toBeVisible()
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('Catálogo: adds a building and rejects a repeated name', async ({ page }) => {
    await page.goto(CATALOG)
    const name = page.getByRole('textbox', { name: 'Nuevo edificio' })

    await name.fill('Gimnasio')
    await page.getByRole('button', { name: 'Agregar edificio' }).click()
    await expect(page.getByRole('list', { name: 'Espacios de Gimnasio' })).toBeAttached()
    await expect(page.getByText('No se ofrece: no tiene espacios activos.')).toBeVisible()

    // RF-CATALOGO-08: same name ignoring case and extra spaces.
    await name.fill('  biblioteca ')
    await page.getByRole('button', { name: 'Agregar edificio' }).click()
    await expect(page.getByRole('alert')).toHaveText('Ya existe un edificio con ese nombre en este campus.')
  })

  test('Catálogo RF-CATALOGO-21: a building with open reports cannot be deactivated', async ({ page }) => {
    await page.goto(CATALOG)
    await page.getByRole('button', { name: 'Desactivar edificio Edificio 5' }).click()
    await expect(page.getByRole('alert')).toHaveText('No se puede desactivar un edificio con reportes abiertos.')
  })

  test('Catálogo RF-CATALOGO-13: sets the position of a building', async ({ page }) => {
    await page.goto(CATALOG)
    await page.getByRole('button', { name: 'Cambiar posición de Biblioteca' }).click()
    const dialog = page.getByRole('dialog', { name: 'Posición de Biblioteca en el plano' })
    await dialog.getByRole('spinbutton', { name: 'Horizontal (%)' }).fill('30')
    await dialog.getByRole('spinbutton', { name: 'Vertical (%)' }).fill('40')
    await expectNoA11yViolations(page)
    await dialog.getByRole('button', { name: 'Guardar posición' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText('En el plano (30%, 40%)')).toBeVisible()
  })

  test('Personal RF-ACCESO-06, 08: assigns a role by email', async ({ page }) => {
    await page.goto(STAFF)
    const email = page.getByLabel('Correo institucional')

    await email.fill('alguien@gmail.com')
    await page.getByRole('button', { name: 'Asignar rol' }).click()
    await expect(email).toHaveAccessibleDescription(/dominio @uabc\.edu\.mx/)

    await email.fill('Nuevo.Encargado@uabc.edu.mx')
    await page.getByRole('button', { name: 'Asignar rol' }).click()
    const staff = page.getByRole('region', { name: 'Encargados' })
    await expect(staff.getByText('nuevo.encargado@uabc.edu.mx')).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('Personal RF-ACCESO-09: an Encargado with open reports keeps the role', async ({ page }) => {
    await page.goto(STAFF)
    await page.getByRole('button', { name: 'Retirar rol: carlos.ruiz@uabc.edu.mx' }).click()
    await expect(page.getByRole('alert')).toContainText('tiene reportes abiertos asignados')
  })

  test('Configuración RF-MAPA-23: rejects a Medio threshold below 2', async ({ page, browserName }) => {
    await page.goto(SETTINGS)
    await expect(page.getByRole('heading', { level: 1, name: 'Configuración' })).toBeVisible()
    // axe crashes the Firefox page on this screen ("Page crashed", every run); the same steps pass
    // without it, so it is axe and not the app. Chromium and WebKit still run the check here.
    if (browserName !== 'firefox') await expectNoA11yViolations(page)

    await page.getByLabel('Nivel Medio desde').fill('1')
    await page.getByRole('button', { name: 'Guardar umbrales del mapa' }).click()
    await expect(page.getByRole('alert')).toContainText('2 o mayor')

    await page.getByLabel('Nivel Medio desde').fill('4')
    await page.getByLabel('Nivel Alto desde').fill('8')
    await expect(page.getByRole('list', { name: 'Vista previa de la leyenda' })).toContainText('Bajo: 1 a 3')
    await page.getByRole('button', { name: 'Guardar umbrales del mapa' }).click()
    await expect(page.getByText('Umbrales del mapa guardados.')).toBeVisible()
  })

  test('Configuración RF-NOTIFICACION-14: an empty alert threshold means none', async ({ page }) => {
    await page.goto(SETTINGS)
    await page.getByLabel('Reportes Nuevos').fill('')
    await page.getByLabel('Reportes En revisión').fill('3')
    await page.getByRole('button', { name: 'Guardar umbrales de alerta' }).click()
    await expect(page.getByText('Umbrales de alerta guardados: Nuevos, sin alerta; En revisión, 3.')).toBeVisible()
  })
})
