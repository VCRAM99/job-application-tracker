import { expect, test, type Page } from "@playwright/test"

import { open } from "./support/user"

/**
 * Daily Tasks overhaul: opens on today, instant day changes (arrows, keys, picker), optimistic
 * checklist and food with rollback, the gear preferences panel, metric toggles, goal-mode
 * statuses, and the insights row.
 */
test.describe.configure({ mode: "serial" })

const selected = (page: Page) => page.locator("[data-selected-date]:visible").getAttribute("data-selected-date")
const day = (page: Page) => page.locator("[data-selected-date]:visible")
/** The visible Health section (Next can keep a hidden copy of the page in the DOM). */
const health = (page: Page) => page.getByRole("region", { name: "Health", exact: true })
const browserToday = (page: Page) => page.evaluate(() => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()))

async function gear(page: Page) {
  await page.getByRole("button", { name: "Daily Tasks preferences" }).click()
  return page.getByRole("dialog", { name: "Preferences" })
}

test.beforeAll(async ({ browser }) => {
  // Health tracking on for the e2e user (Settings → Health Tracking).
  const page = await browser.newPage({ storageState: "e2e/.state/storage.json" })
  await open(page, "/settings")
  const on = page.getByRole("button", { name: "Turn on" })
  if (await on.count()) await on.click()
  await page.close()
})

test("opens on today, changes day instantly, and always reopens on today", async ({ page }) => {
  await open(page, "/daily-tasks/new")
  await page.getByLabel("Title").fill("E2E daily habit")
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    const box = page.getByRole("checkbox", { name: day })
    if (!(await box.isChecked())) await box.check()
  }
  await page.getByRole("button", { name: "Create task" }).click()
  await page.waitForURL((url) => url.pathname === "/daily-tasks")

  const today = await browserToday(page)
  expect(await selected(page)).toBe(today)
  await expect(page.getByRole("button", { name: "Show date" })).toHaveCount(0)

  const shift = (days: number) => {
    const [y, m, d] = today.split("-").map(Number)
    return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10)
  }
  await page.getByRole("button", { name: "Next day" }).click()
  await expect(day(page)).toHaveAttribute("data-selected-date", shift(1))
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("ArrowLeft")
  await expect(day(page)).toHaveAttribute("data-selected-date", shift(-1))
  await page.getByRole("button", { name: "Previous day" }).click()
  await expect(day(page)).toHaveAttribute("data-selected-date", shift(-2))
  await page.getByRole("button", { name: "Today" }).click()
  await expect(day(page)).toHaveAttribute("data-selected-date", today)

  await page.getByLabel("Choose a date").fill("2026-01-15")
  await expect(day(page)).toHaveAttribute("data-selected-date", "2026-01-15")
  await expect(page.locator("[data-day-loading]")).toHaveCount(0)
  // Nothing about the day is kept in the URL; a reload is back on today.
  expect(new URL(page.url()).search).toBe("")
  await page.reload()
  await expect(day(page)).toHaveAttribute("data-selected-date", today)
})

test("checks a habit instantly, keeps it after reload, and rolls back a failed save", async ({ page }) => {
  await open(page, "/daily-tasks")
  const habit = page.getByRole("checkbox", { name: "E2E daily habit" })
  await expect(habit).toHaveAttribute("aria-checked", "false")
  await habit.click()
  await expect(habit).toHaveAttribute("aria-checked", "true")
  await page.waitForLoadState("networkidle")
  await page.reload()
  await expect(page.getByRole("checkbox", { name: "E2E daily habit" })).toHaveAttribute("aria-checked", "true")

  // The next save fails at the network: the check rolls back and a notice appears.
  await page.route("**/daily-tasks", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()))
  await page.getByRole("checkbox", { name: "E2E daily habit" }).click()
  await expect(page.getByRole("checkbox", { name: "E2E daily habit" })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByText("The task could not be updated.")).toBeVisible()
  await page.unroute("**/daily-tasks")
})

test("adds food instantly, shows goal-mode statuses, and deletes with undo", async ({ page }) => {
  await open(page, "/daily-tasks")
  const panel = await gear(page)
  await panel.getByLabel("Calorie target").fill("1000")
  await panel.getByLabel("Calorie target").press("Enter")
  await panel.getByRole("radio", { name: "Cutting" }).check()
  await page.keyboard.press("Escape")

  const form = page.getByRole("form", { name: "Add food" })
  await form.getByLabel("Food").fill("E2E lunch")
  await form.getByLabel("Calories").fill("950")
  await form.getByLabel("Protein").fill("40")
  await form.getByRole("button", { name: "Add" }).click()
  await expect(health(page).getByText("E2E lunch")).toBeVisible()
  const calories = health(page).locator('[data-metric="calories"]')
  await expect(calories).toHaveAttribute("data-tone", "close")
  await expect(calories.getByText("Close")).toBeVisible()

  await form.getByLabel("Food").fill("E2E snack")
  await form.getByLabel("Calories").fill("100")
  await form.getByLabel("Protein").fill("3")
  await form.getByRole("button", { name: "Add" }).click()
  await expect(calories).toHaveAttribute("data-tone", "over")
  await expect(calories.getByText("Over")).toBeVisible()

  const settings = await gear(page)
  await settings.getByRole("radio", { name: "Bulking" }).check()
  await page.keyboard.press("Escape")
  await expect(calories).toHaveAttribute("data-tone", "good")
  await expect(calories.getByText("Reached")).toBeVisible()

  await page.waitForLoadState("networkidle")
  await page.reload()
  await expect(health(page).getByText("E2E lunch")).toBeVisible()
  await expect(health(page).locator('[data-metric="calories"]')).toHaveAttribute("data-tone", "good")

  await page.getByRole("button", { name: "Delete E2E snack" }).click()
  await expect(health(page).getByText("E2E snack")).toHaveCount(0)
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  await expect(health(page).getByText("E2E snack")).toBeVisible()
})

test("hides a metric from the page and insights, keeps its data, and the panel closes on Esc and outside clicks", async ({ page }) => {
  await open(page, "/daily-tasks")
  await page.getByRole("form", { name: "Add sleep" }).getByLabel("Hours slept").fill("7")
  await page.getByRole("form", { name: "Add sleep" }).getByRole("button", { name: "Add" }).click()
  await expect(health(page).locator('[data-metric="sleep"]')).toContainText("7h 0m")

  let panel = await gear(page)
  await panel.getByRole("switch", { name: "Sleep" }).uncheck()
  await expect(page.getByRole("form", { name: "Add sleep" })).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Health Insights" }).getByText("Sleep", { exact: true })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Daily Tasks preferences" })).toBeFocused()

  await page.waitForLoadState("networkidle")
  await page.reload()
  await expect(page.getByRole("form", { name: "Add sleep" })).toHaveCount(0)
  panel = await gear(page)
  await panel.getByRole("switch", { name: "Sleep" }).check()
  await page.mouse.click(10, 10)
  await expect(panel).toHaveCount(0)
  await expect(health(page).locator('[data-metric="sleep"]')).toContainText("7h 0m")
})

test("puts Health Insights and Weekly Insights side by side on desktop", async ({ page }) => {
  await open(page, "/daily-tasks")
  const health = await page.getByRole("region", { name: "Health Insights" }).boundingBox()
  const weekly = await page.getByRole("region", { name: "Weekly Insights" }).boundingBox()
  expect(health && weekly).toBeTruthy()
  expect(Math.abs(health!.y - weekly!.y)).toBeLessThan(2)
  expect(weekly!.x).toBeGreaterThan(health!.x + health!.width - 1)
})
