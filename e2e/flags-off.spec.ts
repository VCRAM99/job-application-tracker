import { expect, test } from "@playwright/test"

import { open } from "./support/user"

/** Runs against the second server, started with every V2 flag off. Tracking stays available. */
const OFF: Array<[string, string]> = [
  ["/jobs", "Recommended jobs are off"],
  ["/analyze", "Fit analysis is off"],
  ["/resumes", "Resume Studio is off"],
  ["/interview/new", "Career coach is off"],
  ["/interview/stories", "Career coach is off"],
  ["/drafts/new", "Career coach is off"],
]

for (const [path, heading] of OFF) {
  test(`${path} shows the off state`, async ({ page }) => {
    await open(page, path)
    await expect(page.getByRole("heading", { name: heading })).toBeVisible()
  })
}

test("tracking pages still work and hide V2 entry points", async ({ page }) => {
  await open(page, "/dashboard")
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Suggested follow-ups" })).toHaveCount(0)
  await open(page, "/applications")
  await expect(page.getByRole("heading", { level: 1, name: "Applications" })).toBeVisible()
  const first = page.getByRole("table").getByRole("link").first()
  if (await first.count()) {
    await first.click()
    await expect(page.getByRole("button", { name: "Analyze fit" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Research" })).toHaveCount(0)
  }
})
