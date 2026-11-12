import { writeFileSync } from "node:fs"

import { expect, test } from "@playwright/test"

import { open } from "./support/user"

test("dashboard loads with counts", async ({ page }) => {
  await open(page, "/dashboard")
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()
  await expect(page.getByRole("term").filter({ hasText: /^Active applications$/ })).toBeVisible()
  await expect(page.getByRole("region", { name: "Suggested follow-ups" })).toBeVisible()
})

test("companies: create, edit, delete", async ({ page }) => {
  await open(page, "/companies/new")
  await page.getByLabel("Name").fill("Acme Robotics")
  await page.getByLabel("Priority").selectOption("A")
  await page.getByLabel("Industry").fill("Robotics")
  await page.getByRole("button", { name: "Create company" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Acme Robotics" })).toBeVisible()

  await page.getByRole("button", { name: "Edit" }).click()
  await page.waitForURL("**/edit")
  await page.getByLabel("Location").fill("Montreal")
  await page.getByRole("button", { name: "Save company" }).click()
  await page.waitForURL((url) => !url.pathname.endsWith("/edit"))
  await expect(page.getByText("Montreal")).toBeVisible()

  await open(page, "/companies")
  await page.getByRole("link", { name: "Acme Robotics" }).click()
  // Delete lives in the ⋯ menu; it still opens the same confirmation dialog.
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("button", { name: "Delete company" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Delete company" }).click()
  await page.waitForURL("**/companies")
  await expect(page.getByRole("link", { name: "Acme Robotics" })).toHaveCount(0)
})

test("applications: create, edit, change status, delete", async ({ page }) => {
  await open(page, "/applications/new")
  const newCompany = page.getByRole("radio", { name: "New company" })
  if (await newCompany.isEnabled()) await newCompany.check()
  await page.getByLabel("New company name").fill("Bluefin Health")
  await page.getByLabel("Job title").fill("Platform Engineer")
  await page.getByLabel("Status", { exact: true }).selectOption("applied")
  await page.getByLabel("Applied date").fill("2026-10-20")
  await page.getByRole("button", { name: "Create application" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Platform Engineer" })).toBeVisible()

  // Secondary actions moved into the ⋯ menu stay reachable.
  await page.getByRole("button", { name: "More actions" }).click()
  await expect(page.getByRole("link", { name: "Analyze fit" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("link", { name: "Analyze fit" })).toBeHidden()

  await page.getByRole("button", { name: "Edit" }).click()
  await page.waitForURL("**/edit")
  await page.getByLabel("Location").fill("Remote, Canada")
  await page.getByRole("button", { name: /^Save/ }).click()
  await page.waitForURL((url) => !url.pathname.endsWith("/edit"))
  await expect(page.getByText("Remote, Canada")).toBeVisible()

  await page.locator("#status-change").selectOption("recruiter_screen")
  await page.getByRole("button", { name: "Update status" }).click()
  await expect(page.getByRole("definition").filter({ hasText: /^Recruiter Screen$/ })).toBeVisible()
  await page.reload()
  await expect(page.locator("#status-change")).toHaveValue("recruiter_screen")

  await open(page, "/applications")
  await page.getByLabel("Status").selectOption("recruiter_screen")
  await page.getByRole("button", { name: "Apply filters" }).click()
  await expect(page.getByRole("link", { name: "Platform Engineer", exact: true })).toBeVisible()

  await page.getByRole("link", { name: "Platform Engineer", exact: true }).click()
  // Delete lives in the ⋯ menu; it still opens the same confirmation dialog.
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("button", { name: "Delete application" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Delete application" }).click()
  await page.waitForURL("**/applications")
  await expect(page.getByRole("link", { name: "Platform Engineer", exact: true })).toHaveCount(0)
})

test("applications: CSV import and export", async ({ page }, testInfo) => {
  const template = await page.request.get("/export/templates/applications?format=csv")
  expect(template.ok()).toBe(true)
  const header = (await template.text()).replace(/^﻿/, "").split(/\r?\n/)[0]!
  const values: Record<string, string> = { "Company Name": "Corvid Labs", "Job Title": "Data Engineer", Status: "saved" }
  const file = testInfo.outputPath("applications.csv")
  writeFileSync(file, `${header}\n${header.split(",").map((column) => values[column] ?? "").join(",")}\n`)

  await open(page, "/applications/import")
  await page.locator("#import-file").setInputFiles(file)
  await page.getByRole("button", { name: "Check file" }).click()
  await page.getByRole("button", { name: "Import 1 row" }).click()
  await expect(page.getByText(/^Imported 1\./)).toBeVisible({ timeout: 30_000 })

  await open(page, "/applications")
  await expect(page.getByRole("link", { name: "Data Engineer" })).toBeVisible()

  const exported = await page.request.get("/export/applications")
  expect(exported.ok()).toBe(true)
  const text = (await exported.text()).replace(/^﻿/, "")
  expect(text.split(/\r?\n/)[0]).toBe(header)
  expect(text).toContain("Data Engineer")
  expect(text).toContain("Corvid Labs")
})

test("contacts: create and edit", async ({ page }) => {
  await open(page, "/networking/new")
  await page.getByLabel("Name").fill("Riley Chen")
  await page.getByLabel("Role").fill("Engineering Manager")
  await page.getByRole("button", { name: "Create contact" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Riley Chen" })).toBeVisible()
  await page.getByRole("button", { name: "Edit" }).click()
  await page.waitForURL("**/edit")
  await page.getByLabel("Outreach").selectOption({ label: "Contacted" })
  await page.getByRole("button", { name: /^Save/ }).click()
  await page.waitForURL((url) => !url.pathname.endsWith("/edit"))
  await expect(page.getByText("Contacted").first()).toBeVisible()
  await open(page, "/networking")
  await expect(page.getByRole("link", { name: "Riley Chen" })).toBeVisible()
})

test("tasks: create and mark complete", async ({ page }) => {
  await open(page, "/tasks/new")
  await page.getByLabel("Title").fill("Send portfolio link")
  await page.getByRole("button", { name: "Create task" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Send portfolio link" })).toBeVisible()
  await open(page, "/tasks")
  const row = page.getByRole("row", { name: /Send portfolio link/ })
  await row.getByRole("button", { name: "Mark complete" }).click()
  await expect(row.getByRole("cell", { name: "Done", exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("row", { name: /Send portfolio link/ }).getByRole("cell", { name: "Done", exact: true })).toBeVisible()
})

test("preparation: create item", async ({ page }) => {
  await open(page, "/preparation/new")
  await page.getByLabel("Title").fill("Practice system design")
  await page.getByLabel("Category").selectOption({ label: "System Design" })
  await page.getByRole("button", { name: "Create item" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Practice system design" })).toBeVisible()
  await open(page, "/preparation")
  await expect(page.getByRole("link", { name: "Practice system design" })).toBeVisible()
})

test("daily tasks: create a habit and check it off", async ({ page }) => {
  await open(page, "/daily-tasks/new")
  await page.getByLabel("Title").fill("Review job boards")
  for (const day of ["Sat", "Sun"]) await page.getByRole("checkbox", { name: day }).check()
  await page.getByRole("button", { name: "Create task" }).click()
  await page.waitForURL((url) => url.pathname === "/daily-tasks")
  // The new habit is scheduled today only if today is a Saturday or Sunday; move to the next Saturday.
  const habit = page.getByRole("checkbox", { name: "Review job boards" })
  for (let step = 0; step < 7 && !(await habit.count()); step++) await page.getByRole("button", { name: "Next day" }).click()
  await habit.click()
  await expect(habit).toHaveAttribute("aria-checked", "true")
  const day = await page.locator("[data-selected-date]:visible").getAttribute("data-selected-date")
  await page.reload()
  for (let step = 0; step < 7 && (await page.locator("[data-selected-date]:visible").getAttribute("data-selected-date")) !== day; step++) {
    await page.getByRole("button", { name: "Next day" }).click()
  }
  await expect(page.getByRole("checkbox", { name: "Review job boards" })).toHaveAttribute("aria-checked", "true")
})

test("theme toggle switches and persists", async ({ page }) => {
  await open(page, "/dashboard")
  const toggle = page.getByRole("button", { name: /Switch to (light|dark) mode/ }).first()
  const toLight = /light/.test((await toggle.textContent()) + ((await toggle.getAttribute("aria-label")) ?? ""))
  await toggle.click()
  await expect(page.locator("html")).toHaveClass(toLight ? /\blight\b/ : /\bdark\b/)
  await page.reload()
  await expect(page.getByRole("button", { name: toLight ? "Switch to dark mode" : "Switch to light mode" }).first()).toBeVisible()
})
