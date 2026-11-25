import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

// RNF-USABILIDAD-06: no WCAG 2.2 A/AA violations on the current page.
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  )
  expect(summary).toEqual([])
}

// RNF-USABILIDAD-01: nothing wider than the viewport.
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// Desktop layout starts at Tailwind's lg breakpoint (1024px).
export function isDesktop(page: Page) {
  return (page.viewportSize()?.width ?? 0) >= 1024
}

// Report ids in the order the list shows them (cards on phones, table rows on desktop).
export async function listedReportIds(page: Page) {
  const hrefs = await page
    .getByRole('main')
    .locator('a[href^="/reportes/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  // Only the links that open a report, not its actions (/reportes/:id/asignar).
  return hrefs.flatMap((href) => {
    const id = href?.match(/^\/reportes\/([^/]+)$/)?.[1]
    return id ? [id] : []
  })
}
