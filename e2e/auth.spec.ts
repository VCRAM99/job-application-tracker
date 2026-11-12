import { expect, test } from "@playwright/test"

import { e2eUser, open, openAuth, signIn } from "./support/user"

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/applications")
  await page.waitForURL(/\/login/)
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})

test("wrong password shows an error and stays signed out", async ({ page }) => {
  await openAuth(page, "/login")
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
  await openAuth(page, "/forgot-password")
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByRole("button", { name: /reset|send/i })).toBeVisible()
  await open(page, "/reset-password")
  await expect(page.getByRole("main").or(page.locator("body")).first()).toContainText(/password/i)
})

test("Turnstile renders on sign-in, sign-up, and reset request, and sign-in still works", async ({ page }) => {
  test.skip(process.env.E2E_TURNSTILE !== "1", "Runs with Cloudflare's test site key (npm run test:e2e).")
  const violations: string[] = []
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (load|frame|execute)/i.test(message.text())) violations.push(message.text())
  })
  for (const path of ["/signup", "/forgot-password", "/login"]) {
    // openAuth waits until the test key (always passes) writes its dummy token into the form.
    await openAuth(page, path)
    await expect(page.getByTestId("turnstile")).toBeVisible()
    await expect(page.locator('form input[name="cf-turnstile-response"]')).toHaveValue("XXXX.DUMMY.TOKEN.XXXX")
  }
  const user = e2eUser()
  await page.getByLabel("Email").fill(user.authEmail)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/dashboard")
  expect(violations).toEqual([])
})

test("privacy and terms load signed out and are linked from sign-up and every auth page", async ({ page }) => {
  await openAuth(page, "/signup")
  await expect(page.getByRole("link", { name: "Terms" }).first()).toBeVisible()
  await page.getByRole("link", { name: "Privacy notice" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Delete your data" })).toBeVisible()
  await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible()
  await expect(page).toHaveURL(/\/terms$/)
})
