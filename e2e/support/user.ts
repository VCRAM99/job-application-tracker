import { readFileSync } from "node:fs"
import path from "node:path"

import type { Locator, Page } from "@playwright/test"

import { STATE_DIR } from "./local-env"

export type E2eUser = { email: string; authEmail: string; password: string; id: string }

export function e2eUser(): E2eUser {
  return JSON.parse(readFileSync(path.join(STATE_DIR, "user.json"), "utf8")) as E2eUser
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/dashboard")
}

/** Navigates and waits for streaming to settle. A form page can briefly hold the static shell's copy of its fields. */
export async function open(page: Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState("networkidle")
}

/** Selects the first option whose text matches. */
export async function selectMatching(select: Locator, pattern: RegExp) {
  const labels = await select.locator("option").allTextContents()
  const label = labels.find((text) => pattern.test(text))
  if (!label) throw new Error(`No option matches ${pattern}: ${labels.join(" | ")}`)
  await select.selectOption({ label })
}
