import { readFileSync, writeFileSync } from "node:fs"

import { expect, test, type Page } from "@playwright/test"
import { Document, Packer, Paragraph } from "docx"

import { clearAiRateWindow, E2E_EMAIL } from "./support/seed"
import { open, selectMatching } from "./support/user"

/**
 * AI flows against e2e/support/fake-openai.ts. The seeded user has a BYOK
 * OpenAI key, so every model call goes to the local fake and none leaves the machine.
 */
test.describe.configure({ mode: "serial" })

test.beforeEach(() => clearAiRateWindow(E2E_EMAIL))

const JD =
  "Staff Platform Engineer at Northwind Analytics. You will design TypeScript services backed by PostgreSQL. " +
  "You have 5 years of experience building distributed systems. You care about reliable on-call practices and clear runbooks. " +
  "Experience with Kubernetes is preferred. You will mentor engineers and lead design reviews across teams."

let analysisUrl = ""

async function runAnalysis(page: Page) {
  await open(page, "/analyze")
  await page.getByLabel("Title").fill("Staff Platform Engineer")
  await page.getByLabel("Company").fill("Northwind Analytics")
  await page.getByLabel(/^Job description/).fill(JD)
  await page.getByRole("button", { name: "Analyze fit" }).click()
  await page.waitForURL(/\/analyze\/[0-9a-f-]{36}/, { timeout: 30_000 })
  await expect(page.getByRole("region", { name: "Requirements" })).toBeVisible({ timeout: 30_000 })
}

test("fit analysis runs on the fake provider", async ({ page }) => {
  await runAnalysis(page)
  await expect(page.getByRole("region", { name: "Qualification match estimate" })).toBeVisible()
  await expect(page.getByRole("row", { name: /TypeScript services backed by PostgreSQL/ })).toBeVisible()
  analysisUrl = page.url().split("?")[0]!
})

test("interview prep: questions, add to prep, practice, story bank", async ({ page }) => {
  await open(page, analysisUrl)
  await page.getByRole("button", { name: "Prepare for interview" }).click()
  await page.waitForURL("**/interview/new**")
  await page.getByRole("button", { name: "Generate questions", exact: true }).click()
  await page.waitForURL(/\/interview\/[0-9a-f-]{36}/, { timeout: 30_000 })
  const setUrl = page.url()
  const first = page.getByRole("listitem").filter({ hasText: "How would you approach the main requirement" })
  await expect(first).toBeVisible()
  await expect(page.getByText("Your key").first()).toBeVisible()

  await first.getByRole("button", { name: "Add to prep" }).click()
  await expect(first.getByRole("button", { name: "In prep" })).toBeDisabled()
  await open(page, "/preparation")
  await expect(page.getByRole("link", { name: /How would you approach the main requirement/ })).toHaveCount(1)

  await open(page, setUrl)
  const practice = page.getByRole("listitem").filter({ hasText: "Tell me about a time you changed course" })
  await practice.getByText("Practice", { exact: true }).click()
  await practice.getByLabel("Your answer").fill(
    "In my last role a dependency changed late in a project. I paused the rollout, met with the owning team, and we agreed on a smaller first release. I kept stakeholders updated and we shipped on the new plan.",
  )
  await practice.getByRole("button", { name: "Get coaching notes", exact: true }).click()
  await expect(page.getByText("Coaching notes saved.")).toBeVisible({ timeout: 30_000 })

  await open(page, "/interview/stories")
  await page.getByRole("button", { name: "Build story bank", exact: true }).click()
  await expect(page.getByText(/1 story saved/)).toBeVisible({ timeout: 30_000 })
})

test("research brief from pasted company text", async ({ page }) => {
  await open(page, "/applications/new")
  const newCompany = page.getByRole("radio", { name: "New company" })
  if (await newCompany.isEnabled()) await newCompany.check()
  await page.getByLabel("New company name").fill("Northwind Analytics")
  await page.getByLabel("Job title").fill("Staff Platform Engineer")
  await page.getByLabel("Status", { exact: true }).selectOption("applied")
  await page.getByRole("button", { name: "Create application" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Staff Platform Engineer" })).toBeVisible()

  await page.getByRole("button", { name: "Research" }).click()
  await page.waitForURL("**/research/new**")
  await page.getByLabel("Paste company text").fill(
    "Northwind Analytics builds privacy-first product analytics for clinics. The platform team owns the event pipeline and the warehouse.",
  )
  await page.getByRole("button", { name: /Build brief|Build/ }).first().click()
  await page.waitForURL(/\/research\/[0-9a-f-]{36}/, { timeout: 30_000 })
  await expect(page.getByText("Northwind Analytics builds privacy-first product analytics for clinics.").first()).toBeVisible()
})

test("drafts: outreach draft, labels, mark as sent", async ({ page }) => {
  await open(page, "/networking/new")
  await page.getByLabel("Name").fill("Dana Reyes")
  await page.getByLabel("Email").fill("dana.reyes@example.com")
  await selectMatching(page.getByLabel("Application"), /Staff Platform Engineer/)
  await page.getByLabel("Relationship").selectOption({ label: "Recruiter" })
  await page.getByRole("button", { name: "Create contact" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Dana Reyes" })).toBeVisible()
  const contactUrl = page.url()

  await page.getByRole("button", { name: "Draft" }).first().click()
  await page.waitForURL("**/drafts/new**")
  await page.getByLabel("Format").selectOption("email")
  await page.getByRole("button", { name: "Draft", exact: true }).click()
  await page.waitForURL(/\/drafts\/[0-9a-f-]{36}/, { timeout: 30_000 })
  await expect(page.getByText("AI draft").first()).toBeVisible()
  await expect(page.getByText("Not sent").first()).toBeVisible()
  await expect(page.getByText("I am interested in the open role and would welcome a short conversation.")).toBeVisible()

  await page.getByRole("button", { name: "Mark as sent" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Mark as sent?" })).toBeVisible()
  await dialog.getByRole("button", { name: "Mark as sent" }).click()
  await expect(page.getByText("Marked sent. Contact updated.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Mark as sent" })).toHaveCount(0)

  await open(page, contactUrl)
  await expect(page.getByText("Contacted").first()).toBeVisible()
})

test("follow-up suggestion creates one task", async ({ page }) => {
  await open(page, "/applications/new")
  const newCompany = page.getByRole("radio", { name: "New company" })
  if (await newCompany.isEnabled()) await newCompany.check()
  await page.getByLabel("New company name").fill("Quiet Harbor")
  await page.getByLabel("Job title").fill("Backend Engineer")
  await page.getByLabel("Status", { exact: true }).selectOption("applied")
  await page.getByLabel("Applied date").fill("2026-01-05")
  await page.getByRole("button", { name: "Create application" }).click()
  const followUps = page.getByRole("region", { name: "Follow-ups" })
  await expect(followUps.getByRole("link", { name: /Follow up on Backend Engineer at Quiet Harbor/ })).toBeVisible()
  await followUps.getByRole("button", { name: "Create task" }).dblclick()
  await expect(followUps.getByRole("link", { name: /Follow up on Backend Engineer at Quiet Harbor/ })).toHaveCount(0)
  await open(page, "/tasks")
  await expect(page.getByRole("link", { name: /Follow up on Backend Engineer at Quiet Harbor/ })).toHaveCount(1)
})

test.describe("resume studio", () => {
  // Runs with the real CSP: connect-src names the configured Supabase origin, so the
  // browser's direct upload to local Storage is allowed under `next start`.

test("resume: upload, parse, tailor, export", async ({ page }, testInfo) => {
  const file = testInfo.outputPath("resume.docx")
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph("Jordan Example"),
          new Paragraph("Backend Engineer, Lumen Ridge Labs"),
          new Paragraph("Built TypeScript APIs for the billing team."),
          new Paragraph("Skills: TypeScript"),
        ],
      },
    ],
  })
  writeFileSync(file, await Packer.toBuffer(doc))

  await open(page, "/resumes")
  // Choosing a file uploads it.
  await page.locator('input[type="file"]').setInputFiles(file)
  await page.waitForURL(/\/resumes\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  await page.getByRole("button", { name: "Parse with AI" }).click()
  await expect(page.getByText("Jordan Example").first()).toBeVisible({ timeout: 30_000 })

  const tailor = page.getByRole("region", { name: "Tailor to an analysis" })
  await selectMatching(tailor.getByLabel("Analysis"), /Staff Platform Engineer/)
  await tailor.getByRole("button", { name: "Tailor", exact: true }).click()
  await page.waitForURL("**/tailor**", { timeout: 30_000 })
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Tailor resume", exact: true }).click()
  await page.waitForURL(/\/versions\/[0-9a-f-]{36}/, { timeout: 30_000 })
  const edits = page.getByRole("region", { name: "Proposed edits" })
  await expect(edits.getByText("AI-proposed · unverified")).toBeVisible()
  await expect(edits.getByText("After: PostgreSQL")).toBeVisible()
  await edits.getByRole("button", { name: "Accept", exact: true }).click()
  await expect(page.getByRole("region", { name: "Preview" }).getByText("PostgreSQL")).toBeVisible()

  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "DOCX", exact: true }).click()
  const file2 = await download
  expect(file2.suggestedFilename()).toMatch(/\.docx$/)
  expect(readFileSync((await file2.path())!).subarray(0, 2).toString()).toBe("PK")
})
})
