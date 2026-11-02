import { expect, test } from "@playwright/test"

import { e2eUser, open, signIn } from "./support/user"

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/applications")
  await page.waitForURL(/\/login/)
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})

test("wrong password shows an error and stays signed out", async ({ page }) => {
  await open(page, "/login")
  await page.getByLabel("Email").fill(e2eUser().authEmail)
  await page.getByLabel("Password").fill("not-the-password-1")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByRole("alert").filter({ hasText: /./ }).first()).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test("sign in and sign out", async ({ page }) => {
  const user = e2eUser()
  // A separate user: sign-out revokes every session of the account.
  await signIn(page, user.authEmail, user.password)
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()
  await page.getByRole("button", { name: "Sign out" }).first().click()
  await page.waitForURL(/\/login/)
  await page.goto("/dashboard")
  await page.waitForURL(/\/login/)
})

test("password reset pages load", async ({ page }) => {
  await open(page, "/forgot-password")
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByRole("button", { name: /reset|send/i })).toBeVisible()
  await open(page, "/reset-password")
  await expect(page.getByRole("main").or(page.locator("body")).first()).toContainText(/password/i)
})
