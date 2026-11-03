import { expect, test, type Page } from "@playwright/test"

import { open } from "./support/user"

// Visible cards only: Next keeps the previous route mounted but hidden (React Activity) after a
// client navigation, so the last results page can still be in the DOM.
const card = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({ visible: true }).filter({ has: page.getByText(title, { exact: true }) })

async function search(page: Page, keyword: string, options: { saved?: boolean; hidden?: boolean } = {}) {
  await open(page, "/jobs")
  await page.getByLabel("Role, company, or keyword").fill(keyword)
  // Advanced filters sit in the "More filters" disclosure.
  if (options.saved || options.hidden) await page.getByText("More filters", { exact: true }).click()
  if (options.saved) await page.getByRole("checkbox", { name: "Saved jobs" }).check()
  if (options.hidden) await page.getByRole("checkbox", { name: "Include hidden jobs" }).check()
  await page.getByRole("button", { name: "Search", exact: true }).click()
  await page.waitForURL(/[?&]q=/)
}

/**
 * The seed loads src/lib/jobs/sources/fixtures/greenhouse.json into the local catalog. Other
 * local sources (such as the perf dataset) may also be approved, so the test searches for
 * "Account Executive", a title only the fixture has.
 */
test("jobs: search, save, hide, add to tracker", async ({ page }) => {
  await search(page, "Account Executive")
  await expect(card(page, "Account Executive")).toBeVisible()
  await expect(card(page, "Senior Backend Engineer")).toHaveCount(0)
  // Less frequent actions moved into the card's ⋯ menu stay reachable.
  const more = card(page, "Account Executive").getByRole("button", { name: "More job actions" })
  await more.click()
  // The panel renders in a portal; the ⋯ button names it with aria-controls.
  const panel = page.locator(`[id="${await more.getAttribute("aria-controls")}"]`)
  for (const name of ["Not interested", "Already applied", "Prefer company", "Exclude company"]) {
    await expect(panel.getByRole("button", { name })).toBeVisible()
    await expect(panel.getByRole("button", { name })).toBeInViewport()
  }
  await page.keyboard.press("Escape")

  await card(page, "Account Executive").getByRole("button", { name: "Save", exact: true }).click()
  await expect(card(page, "Account Executive").getByRole("button", { name: "Unsave" })).toBeVisible()
  await search(page, "Account Executive", { saved: true })
  await expect(card(page, "Account Executive")).toBeVisible()

  await search(page, "Account Executive")
  await card(page, "Account Executive").getByRole("button", { name: "Hide", exact: true }).click()
  await expect(card(page, "Account Executive")).toHaveCount(0)
  await search(page, "Account Executive", { hidden: true })
  await expect(card(page, "Account Executive").getByRole("button", { name: "Unhide" })).toBeVisible()

  await search(page, "Senior Backend Engineer")
  await card(page, "Senior Backend Engineer").first().getByRole("button", { name: "Add to tracker" }).click()
  await page.waitForURL("**/applications/new?posting=**")
  await page.waitForLoadState("networkidle")
  await expect(page.getByLabel("Job title")).toHaveValue("Senior Backend Engineer")
  await page.getByRole("button", { name: "Create application" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Senior Backend Engineer" })).toBeVisible()
  await open(page, "/applications")
  await expect(page.getByRole("link", { name: "Senior Backend Engineer" })).toBeVisible()
})
