import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, expectNoHorizontalScroll } from './helpers'

test.describe('campus map (/mapa)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/mapa')
    await expect(page.getByRole('heading', { name: 'Mapa · Campus Sauzal' })).toBeVisible()
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

  test('RF-MAPA-15: lists buildings with open reports and opens the filtered list', async ({
    page,
  }) => {
    const rows = page.getByRole('heading', { name: 'Edificios con reportes abiertos' })
    await expect(rows).toBeVisible()

    await page.getByRole('link', { name: /Edificio 5\s*7 reportes\s*Alto/ }).click()
    await expect(page).toHaveURL(/\/reportes\?edificio=Edificio(\+|%20)5/)
    await expect(page.getByLabel('Edificio')).toHaveValue('Edificio 5')
  })

  test('the bottom nav marks the current section', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Secciones' })
    await expect(nav.getByRole('link', { name: 'Mapa' })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('link', { name: 'Reportes' }).click()
    await expect(page).toHaveURL(/\/reportes$/)
  })
})
