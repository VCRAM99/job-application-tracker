import { expect, test, type Page } from "@playwright/test"

import { open } from "./support/user"

const card = (page: Page, title: string) => page.locator('[data-slot="card"]').filter({ has: page.getByText(title, { exact: true }) })

/** The seed loads src/lib/jobs/sources/fixtures/greenhouse.json into the local catalog. */
test("jobs: search, save, hide, add to tracker", async ({ page }) => {
  await open(page, "/jobs")
  await page.getByLabel("Role, company, or keyword").fill("Backend")
  await page.getByRole("button", { name: "Search", exact: true }).click()
  await expect(page.getByText("1 matching jobs")).toBeVisible()
  await expect(card(page, "Senior Backend Engineer")).toBeVisible()
  await expect(card(page, "Account Executive")).toHaveCount(0)

  await card(page, "Senior Backend Engineer").getByRole("button", { name: "Save", exact: true }).click()
  await expect(card(page, "Senior Backend Engineer").getByRole("button", { name: "Unsave" })).toBeVisible()
  await open(page, "/jobs")
  await page.getByRole("checkbox", { name: "Saved jobs" }).check()
  await page.getByRole("button", { name: "Search", exact: true }).click()
  await expect(card(page, "Senior Backend Engineer")).toBeVisible()
  await expect(card(page, "Account Executive")).toHaveCount(0)

  await open(page, "/jobs")
  await card(page, "Account Executive").getByRole("button", { name: "Hide", exact: true }).click()
  await expect(card(page, "Account Executive")).toHaveCount(0)
  await page.getByRole("checkbox", { name: "Include hidden jobs" }).check()
  await page.getByRole("button", { name: "Search", exact: true }).click()
  await expect(card(page, "Account Executive").getByRole("button", { name: "Unhide" })).toBeVisible()

  await open(page, "/jobs")
  await card(page, "Senior Backend Engineer").getByRole("button", { name: "Add to tracker" }).click()
  await page.waitForURL("**/applications/new?posting=**")
  await page.waitForLoadState("networkidle")
  await expect(page.getByLabel("Job title")).toHaveValue("Senior Backend Engineer")
  await page.getByRole("button", { name: "Create application" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Senior Backend Engineer" })).toBeVisible()
  await open(page, "/applications")
  await expect(page.getByRole("link", { name: "Senior Backend Engineer" })).toBeVisible()
})
