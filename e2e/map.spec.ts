import { expect, test } from './fixtures'
import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  isDesktop,
  listedReportIds,
} from './helpers'
import { CAMPUS, REPORT } from './seed'

test.describe('campus map (/mapa)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/mapa')
    await expect(
      page.getByRole('heading', { level: 1, name: isDesktop(page) ? 'Mapa' : `Mapa · ${CAMPUS.name}` }),
    ).toBeVisible()
  })

  test('is accessible and fits the screen', async ({ page }) => {
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2)
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('RF-MAPA-10: shows the level legend', async ({ page }) => {
    const legend = page.getByRole('list', { name: 'Leyenda de niveles' })
    await expect(legend.getByRole('listitem')).toHaveText([
      'Bajo: 1 a 2',
      'Medio: 3 a 5',
      'Alto: 6 o más',
    ])
  })

  test('RF-MAPA-05…08: one indicator per building with open reports, with its count', async ({ page }) => {
    // Biblioteca only has a Resuelto report (RF-MAPA-07).
    const list = page.getByRole('region', { name: 'Edificios con reportes abiertos' })
    await expect(list.getByRole('link')).toHaveText([
      /Edificio 5\s*4 reportes abiertos · Nivel medio/,
      /Edificio 2\s*1 reporte abierto · Nivel bajo/,
    ])
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2)
    expect((await page.locator('.leaflet-marker-icon').allTextContents()).sort()).toEqual(['1', '4'])
  })

  test('manual 4.8: selecting an indicator shows the name of its building', async ({ page }) => {
    await page.locator('.leaflet-marker-icon', { hasText: '4' }).click()
    await expect(page.locator('.leaflet-popup')).toContainText('Edificio 5')
  })

  test('RF-MAPA-16…19: a building lists its open reports and back to the map without reloading', async ({
    page,
  }) => {
    const mapRequests: string[] = []
    page.on('request', (request) => {
      if (/\/api\/campuses\/[^/]+\/map$/.test(new URL(request.url()).pathname)) mapRequests.push(request.url())
    })
    const list = page.getByRole('region', { name: 'Edificios con reportes abiertos' })
    await list.getByRole('link', { name: /Edificio 5/ }).click()

    await expect(page).toHaveURL(/\/mapa\/edificios\//)
    await expect(page.getByRole('heading', { name: 'Edificio 5 · 4 reportes abiertos' })).toBeVisible()
    // RF-MAPA-18: the order of the consultation.
    await expect.poll(() => listedReportIds(page)).toEqual([REPORT.r3, REPORT.r1, REPORT.r4, REPORT.r6])

    await page.getByRole('link', { name: 'Volver al mapa' }).click()
    await expect(page).toHaveURL(/\/mapa$/)
    await expect(list).toBeVisible()
    expect(mapRequests).toEqual([])
  })

  test('the nav marks the current section', async ({ page }) => {
    // Bottom nav on phones, side menu from lg (1024px) up.
    const nav = page.getByRole('navigation', { name: isDesktop(page) ? 'Principal' : 'Secciones' })
    await expect(nav.getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('link', { name: 'Reportes' }).click()
    await expect(page).toHaveURL(/\/reportes$/)
  })
})
