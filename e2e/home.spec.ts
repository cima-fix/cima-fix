import { expect, test, type Page } from '@playwright/test'
import { expectNoA11yViolations, expectNoHorizontalScroll } from './helpers'

// Desktop layout starts at Tailwind's lg breakpoint (1024px).
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024

test.describe('home (/)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Cima Fix' })).toBeVisible()
  })

  test('is accessible and fits the screen', async ({ page }) => {
    await expectNoA11yViolations(page)
    await expectNoHorizontalScroll(page)
  })

  test('the dashboard is only on desktop', async ({ page }) => {
    const urgent = page.getByRole('heading', { name: 'Reportes abiertos más urgentes' })
    if (isDesktop(page)) {
      await expect(urgent).toBeVisible()
      await expect(page.getByRole('article')).toHaveCount(4)
    } else {
      // Not rendered at all: the loader skipped the reports on the phone.
      await expect(urgent).toHaveCount(0)
      await expect(page.getByRole('article')).toHaveCount(0)
    }
  })

  test('growing the window to desktop loads the dashboard', async ({ page }) => {
    test.skip(isDesktop(page), 'starts on a phone-sized window')
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByRole('heading', { name: 'Reportes abiertos más urgentes' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(4)
  })
})
