import { expect, test } from "@playwright/test"

import { open } from "./support/user"

const PAGES = ["/dashboard", "/applications", "/companies", "/jobs", "/analyze", "/resumes", "/networking", "/tasks", "/daily-tasks", "/career"]

for (const path of PAGES) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    await open(page, path)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
}

test("mobile navigation opens and navigates", async ({ page }) => {
  await open(page, "/dashboard")
  await page.getByRole("button", { name: /menu|navigation/i }).first().click()
  await page.getByRole("link", { name: "Applications" }).last().click()
  await page.waitForURL("**/applications")
  await expect(page.getByRole("heading", { level: 1, name: "Applications" })).toBeVisible()
})

test("daily tasks: insights stack and the preferences panel fits a phone", async ({ page }) => {
  await open(page, "/daily-tasks")
  const weekly = await page.getByRole("region", { name: "Weekly Insights" }).boundingBox()
  const health = page.getByRole("region", { name: "Health Insights" })
  if (await health.count()) {
    const box = await health.boundingBox()
    expect(weekly!.y).toBeGreaterThan(box!.y + box!.height - 1)
  }
  await page.getByRole("button", { name: "Daily Tasks preferences" }).click()
  const panel = await page.getByRole("dialog", { name: "Preferences" }).boundingBox()
  const width = page.viewportSize()!.width
  expect(panel!.x).toBeGreaterThanOrEqual(0)
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(width)
})
