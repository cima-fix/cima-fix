import { expect, test } from '@playwright/test'
import {
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  isDesktop,
  listedReportIds,
} from './helpers'

test.describe('campus map (/mapa)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/mapa')
    await expect(
      page.getByRole('heading', { level: 1, name: isDesktop(page) ? 'Mapa' : 'Mapa · Campus Sauzal' }),
    ).toBeVisible()
  })

  test('is accessible and fits the screen', async ({ page }) => {
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

  test('RF-MAPA-07: a building without open reports has no indicator', async ({ page }) => {
    // Biblioteca only has a Resuelto report.
    await expect(page.locator('a[href*="edificio=Biblioteca"]')).toHaveCount(0)
    // Edificio 2: plan indicator + text alternative row.
    await expect(page.locator('a[href*="edificio=Edificio+2"]')).toHaveCount(2)
  })

  test('RF-MAPA-08/16: the count matches the open reports listed for the building', async ({
    page,
  }) => {
    const list = page.getByRole('region', { name: 'Edificios con reportes abiertos' })
    await list.getByRole('link', { name: /Edificio 5/ }).click()

    await expect(page).toHaveURL(/edificio=Edificio\+5/)
    await expect(page.getByLabel('Estado')).toHaveValue('Abiertos')
    await expect.poll(() => listedReportIds(page)).toEqual(['r-3', 'r-1', 'r-4', 'r-6'])
  })

  test('the nav marks the current section', async ({ page }) => {
    // Bottom nav on phones, side menu from lg (1024px) up.
    const nav = page.getByRole('navigation', { name: isDesktop(page) ? 'Principal' : 'Secciones' })
    await expect(nav.getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('link', { name: 'Reportes' }).click()
    await expect(page).toHaveURL(/\/reportes$/)
  })
})
