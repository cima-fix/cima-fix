import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, expectNoHorizontalScroll, isDesktop } from './helpers'

const URGENT = 'Lo más urgente para ti'

test.describe('home (/)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Phone: "Cima Fix". Desktop: "Inicio" (Figma "Inicio · Encargado · Escritorio").
    await expect(
      page.getByRole('heading', { level: 1, name: isDesktop(page) ? 'Inicio' : 'Cima Fix' }),
    ).toBeVisible()
  })

  test('is accessible and fits the screen', async ({ page }) => {
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('the dashboard is only on desktop', async ({ page }) => {
    const urgent = page.getByRole('heading', { name: URGENT })
    if (isDesktop(page)) {
      await expect(urgent).toBeVisible()
      // Open reports assigned to the account or to nobody: r-1, r-2, r-3, r-6.
      await expect(page.getByRole('article')).toHaveCount(4)
      await expect(page.getByRole('link', { name: 'Ver nuevos sin asignar' })).toBeVisible()
    } else {
      // Not rendered at all: the loader skipped the reports on the phone.
      await expect(urgent).toHaveCount(0)
      await expect(page.getByRole('article')).toHaveCount(0)
    }
  })

  test('growing the window to desktop loads the dashboard', async ({ page }) => {
    test.skip(isDesktop(page), 'starts on a phone-sized window')
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByRole('heading', { name: URGENT })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(4)
  })

  test('the Encargado sees Personal but not the Admin sections', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: isDesktop(page) ? 'Principal' : 'Administración' })
    await expect(nav.getByRole('link', { name: 'Personal' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Catálogo' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Configuración' })).toHaveCount(0)
  })
})
