/**
 * LOCAL ONLY. Captures every page and key states of the production build for UI review.
 *
 *   npx tsx e2e/support/serve.ts build      # once, local env only
 *   npm run ui:screenshots -- before        # writes docs/ui/before/*.webp
 *
 * Seeds the perf dataset (scripts/perf/seed-dataset.ts) and the e2e users, starts the fake
 * OpenAI server and `next start` with every V2 flag on, creates AI states through the UI
 * (fit analysis, questions, practice, story bank, research, a draft, a tailored resume), then
 * captures: dark desktop for every page, light desktop and 390px mobile for key pages, empty
 * states (a user with no records), validation errors, and confirmation dialogs.
 * Images are WebP (sharp, which Next already installs).
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test"
import sharp from "sharp"

import { APP_PORT, FAKE_OPENAI_PORT, ROOT, STATE_DIR } from "../../e2e/support/local-env"

const label = process.argv[2] === "after" ? "after" : "before"
const OUT = path.join(ROOT, "docs/ui", label)
const BASE = `http://127.0.0.1:${APP_PORT}`
const JD =
  "Staff Platform Engineer at Perf Company 001. You will design TypeScript services backed by PostgreSQL. " +
  "You have 5 years of experience building distributed systems. You care about reliable on-call practices and clear runbooks. " +
  "Experience with Kubernetes is preferred. You will mentor engineers and lead design reviews across teams."

type Theme = "dark" | "light"
type Shot = { name: string; path: string; themes?: Theme[]; mobile?: boolean; prepare?: (page: Page) => Promise<void>; signedOut?: boolean; empty?: boolean }

function start(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(command, args, { cwd: ROOT, env, stdio: "ignore" })
}

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${url} did not start`)
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(400)
}

async function signIn(context: BrowserContext, email: string, password: string) {
  const page = await context.newPage()
  await page.goto(`${BASE}/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/dashboard")
  await page.close()
}

async function newContext(browser: Browser, theme: Theme, mobile: boolean, storage?: Awaited<ReturnType<BrowserContext["storageState"]>>) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: theme,
    storageState: storage,
    // The production CSP blocks the browser's direct upload to local Storage under next start.
    bypassCSP: true,
  })
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem("theme", value)
    } catch {}
  }, theme)
  return context
}

async function save(page: Page, name: string) {
  const png = await page.screenshot({ fullPage: true, animations: "disabled" })
  const webp = await sharp(png).resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 62 }).toBuffer()
  writeFileSync(path.join(OUT, `${name}.webp`), webp)
}

async function main() {
  // Fresh data: the perf user (populated) and the e2e users (one stays empty).
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/perf/seed-dataset.ts"], { cwd: ROOT, stdio: "inherit" })
  execFileSync("npx", ["tsx", "--conditions=react-server", "e2e/support/seed.ts"], { cwd: ROOT, stdio: "inherit" })
  const perf = JSON.parse(readFileSync(path.join(STATE_DIR, "perf-user.json"), "utf8")) as { email: string; password: string }
  const empty = JSON.parse(readFileSync(path.join(STATE_DIR, "user.json"), "utf8")) as { authEmail: string; password: string }

  const fake = start("npx", ["tsx", "e2e/support/fake-openai.ts"], process.env)
  const app = start("npx", ["tsx", "e2e/support/serve.ts", "start", "on"], process.env)
  const stop = () => {
    app.kill("SIGTERM")
    fake.kill("SIGTERM")
  }
  process.on("exit", stop)
  await waitFor(`http://127.0.0.1:${FAKE_OPENAI_PORT}`)
  await waitFor(`${BASE}/login`)

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()

  // Populate AI states as the perf user and remember the ids.
  const setup = await newContext(browser, "dark", false)
  await signIn(setup, perf.email, perf.password)
  const page = await setup.newPage()
  const ids: Record<string, string> = {}
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      console.error(`setup ${name} failed: ${(error as Error).message.split("\n")[0]}`)
    }
  }
  const idFrom = (pattern: RegExp) => pattern.exec(new URL(page.url()).pathname)?.[1] ?? ""

  await step("health", async () => {
    await page.goto("/settings")
    await settle(page)
    const on = page.getByRole("button", { name: "Turn on" })
    if (await on.count()) await on.first().click()
    await settle(page)
  })
  await step("application", async () => {
    await page.goto("/applications")
    await page.locator('table a[href^="/applications/"]').first().waitFor()
    const href = await page.locator('table a[href^="/applications/"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? "").find((value) => /^\/applications\/[0-9a-f-]{36}$/.test(value)),
    )
    ids.application = href!.split("/").pop()!
  })
  await step("company", async () => {
    await page.goto("/companies")
    const href = await page.locator('a[href^="/companies/"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? "").find((value) => /^\/companies\/[0-9a-f-]{36}$/.test(value)),
    )
    ids.company = href!.split("/").pop()!
  })
  await step("contact", async () => {
    await page.goto("/networking")
    await settle(page)
    const href = await page.locator('a[href^="/networking/"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? "").find((value) => /^\/networking\/[0-9a-f-]{36}$/.test(value)),
    )
    ids.contact = href!.split("/").pop()!
  })
  await step("task", async () => {
    await page.goto("/tasks")
    const href = await page.locator('a[href^="/tasks/"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? "").find((value) => /^\/tasks\/[0-9a-f-]{36}$/.test(value)),
    )
    ids.task = href!.split("/").pop()!
  })
  await step("prep", async () => {
    await page.goto("/preparation")
    const href = await page.locator('a[href^="/preparation/"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? "").find((value) => /^\/preparation\/[0-9a-f-]{36}$/.test(value)),
    )
    ids.prep = href!.split("/").pop()!
  })
  await step("job", async () => {
    await page.goto("/jobs")
    await settle(page)
    const href = await page.locator('a[href^="/jobs/"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? "").find((value) => /^\/jobs\/[0-9a-f-]{36}$/.test(value)),
    )
    ids.job = href!.split("/").pop()!
  })
  await step("analysis", async () => {
    await page.goto(`/analyze?application=${ids.application}`)
    await settle(page)
    await page.getByLabel("Title").fill("Staff Platform Engineer")
    await page.getByLabel("Company").fill("Perf Company 001")
    await page.getByLabel(/^Job description/).fill(JD)
    await page.getByRole("button", { name: "Analyze fit" }).click()
    await page.waitForURL(/\/analyze\/[0-9a-f-]{36}/, { timeout: 30_000 })
    ids.analysis = idFrom(/\/analyze\/([0-9a-f-]{36})/)
  })
  await step("questions", async () => {
    await page.goto(`/interview/new?analysis=${ids.analysis}`)
    await settle(page)
    await page.getByRole("button", { name: "Generate questions", exact: true }).click()
    await page.waitForURL(/\/interview\/[0-9a-f-]{36}/, { timeout: 30_000 })
    ids.set = idFrom(/\/interview\/([0-9a-f-]{36})/)
    await settle(page)
    const item = page.getByRole("listitem").filter({ hasText: "Tell me about a time" })
    await item.getByText("Practice", { exact: true }).click()
    await item.getByLabel("Your answer").fill(
      "In my last role a dependency changed late in a project. I paused the rollout, met with the owning team, and we agreed on a smaller first release.",
    )
    await item.getByRole("button", { name: "Get coaching notes", exact: true }).click()
    await page.getByText("Coaching notes saved.").waitFor({ timeout: 30_000 })
  })
  await step("stories", async () => {
    await page.goto("/interview/stories")
    await settle(page)
    await page.getByRole("button", { name: "Build story bank", exact: true }).click()
    await page.getByText(/story saved|stories saved/).waitFor({ timeout: 30_000 })
  })
  await step("research", async () => {
    await page.goto(`/research/new?application=${ids.application}`)
    await settle(page)
    await page.getByLabel("Paste company text").fill("Perf Company 001 builds privacy-first analytics for clinics. The platform team owns the event pipeline and the warehouse.")
    await page.getByRole("button", { name: /Build/ }).first().click()
    await page.waitForURL(/\/research\/[0-9a-f-]{36}/, { timeout: 30_000 })
    ids.brief = idFrom(/\/research\/([0-9a-f-]{36})/)
  })
  await step("draft", async () => {
    await page.goto(`/drafts/new?contact=${ids.contact}`)
    await settle(page)
    await page.getByLabel("Format").selectOption("email").catch(() => {})
    await page.getByRole("button", { name: "Draft", exact: true }).click()
    await page.waitForURL(/\/drafts\/[0-9a-f-]{36}/, { timeout: 30_000 })
    ids.draft = idFrom(/\/drafts\/([0-9a-f-]{36})/)
  })
  await step("resume", async () => {
    const file = path.join(STATE_DIR, "screenshot-resume.docx")
    const { Document, Packer, Paragraph } = await import("docx")
    const doc = new Document({ sections: [{ children: ["Jordan Example", "Backend Engineer, Lumen Ridge Labs", "Built TypeScript APIs for the billing team.", "Skills: TypeScript"].map((text) => new Paragraph(text)) }] })
    writeFileSync(file, await Packer.toBuffer(doc))
    await page.goto("/resumes")
    await settle(page)
    await page.locator('input[type="file"]').setInputFiles(file)
    await page.waitForURL(/\/resumes\/[0-9a-f-]{36}$/, { timeout: 30_000 })
    ids.resume = idFrom(/\/resumes\/([0-9a-f-]{36})/)
    await page.getByRole("button", { name: "Parse with AI" }).click()
    await page.getByRole("region", { name: "Tailor to an analysis" }).waitFor({ timeout: 30_000 })
    await page.goto(`/resumes/${ids.resume}/tailor?analysis=${ids.analysis}`)
    await settle(page)
    await page.getByRole("button", { name: "Tailor resume", exact: true }).click()
    await page.waitForURL(/\/versions\/[0-9a-f-]{36}/, { timeout: 30_000 })
    ids.version = idFrom(/\/versions\/([0-9a-f-]{36})/)
  })
  const storage = await setup.storageState()
  await setup.close()
  writeFileSync(path.join(STATE_DIR, "screenshot-ids.json"), JSON.stringify(ids, null, 2))

  const key: Theme[] = ["dark", "light"]
  const shots: Shot[] = [
    { name: "login", path: "/login", signedOut: true },
    { name: "signup", path: "/signup", signedOut: true },
    { name: "forgot-password", path: "/forgot-password", signedOut: true },
    { name: "reset-password", path: "/reset-password", signedOut: true },
    { name: "dashboard", path: "/dashboard", themes: key, mobile: true },
    { name: "companies", path: "/companies" },
    { name: "company-detail", path: `/companies/${ids.company}` },
    { name: "company-new", path: "/companies/new" },
    { name: "applications", path: "/applications", themes: key, mobile: true },
    { name: "application-detail", path: `/applications/${ids.application}`, themes: key, mobile: true },
    { name: "application-new", path: "/applications/new" },
    { name: "application-edit", path: `/applications/${ids.application}/edit` },
    { name: "applications-import", path: "/applications/import" },
    { name: "networking", path: "/networking" },
    { name: "contact-detail", path: `/networking/${ids.contact}`, themes: key, mobile: true },
    { name: "contact-new", path: "/networking/new" },
    { name: "tasks", path: "/tasks" },
    { name: "task-detail", path: `/tasks/${ids.task}` },
    { name: "task-new", path: "/tasks/new" },
    { name: "preparation", path: "/preparation" },
    { name: "preparation-detail", path: `/preparation/${ids.prep}` },
    { name: "daily-tasks", path: "/daily-tasks" },
    { name: "daily-task-new", path: "/daily-tasks/new" },
    { name: "settings", path: "/settings" },
    { name: "career", path: "/career", themes: key, mobile: true },
    { name: "jobs", path: "/jobs", themes: key, mobile: true },
    { name: "job-detail", path: `/jobs/${ids.job}` },
    { name: "job-alerts", path: "/jobs/alerts" },
    { name: "analyze", path: "/analyze" },
    { name: "analyze-result", path: `/analyze/${ids.analysis}`, themes: key, mobile: true },
    { name: "resumes", path: "/resumes" },
    { name: "resume-detail", path: `/resumes/${ids.resume}` },
    { name: "resume-tailor", path: `/resumes/${ids.resume}/tailor?analysis=${ids.analysis}` },
    { name: "resume-version", path: `/resumes/${ids.resume}/versions/${ids.version}`, themes: key, mobile: true },
    { name: "interview-new", path: `/interview/new?analysis=${ids.analysis}` },
    { name: "interview-set", path: `/interview/${ids.set}` },
    { name: "story-bank", path: "/interview/stories" },
    { name: "research-new", path: `/research/new?application=${ids.application}` },
    { name: "research-brief", path: `/research/${ids.brief}` },
    { name: "draft-new", path: `/drafts/new?contact=${ids.contact}` },
    { name: "draft", path: `/drafts/${ids.draft}` },
    // Key states.
    { name: "state-empty-dashboard", path: "/dashboard", empty: true },
    { name: "state-empty-applications", path: "/applications", empty: true },
    { name: "state-empty-networking", path: "/networking", empty: true },
    { name: "state-empty-resumes", path: "/resumes", empty: true },
    { name: "state-empty-analyze", path: "/analyze", empty: true },
    {
      name: "state-error-application-form",
      path: "/applications/new",
      prepare: async (target) => {
        const radio = target.getByRole("radio", { name: "New company" })
        if (await radio.isEnabled().catch(() => false)) await radio.check()
        await target.getByRole("button", { name: "Create application" }).click()
        await target.waitForTimeout(500)
      },
    },
    {
      name: "state-dialog-delete-application",
      path: `/applications/${ids.application}`,
      prepare: async (target) => {
        const more = target.getByRole("button", { name: "More actions" })
        if (await more.count()) await more.first().click()
        await target.getByRole("button", { name: /Delete/ }).first().click()
        await target.getByRole("dialog").waitFor()
      },
    },
    {
      name: "state-menu-application",
      path: `/applications/${ids.application}`,
      mobile: true,
      prepare: async (target) => {
        await target.getByRole("button", { name: "More actions" }).first().click()
        await target.waitForTimeout(200)
      },
    },
    {
      name: "state-menu-job",
      path: "/jobs",
      mobile: true,
      prepare: async (target) => {
        await target.getByRole("button", { name: "More job actions" }).first().click()
        await target.waitForTimeout(200)
      },
    },
    {
      name: "state-helptip-dashboard",
      path: "/dashboard",
      mobile: true,
      prepare: async (target) => {
        await target.getByRole("button", { name: "About Dashboard" }).click()
        await target.waitForTimeout(200)
      },
    },
    {
      name: "state-dialog-mark-sent",
      path: `/drafts/${ids.draft}`,
      prepare: async (target) => {
        await target.getByRole("button", { name: "Mark as sent" }).click()
        await target.getByRole("dialog").waitFor()
      },
    },
  ]

  const emptyStorage = await (async () => {
    const context = await newContext(browser, "dark", false)
    await signIn(context, empty.authEmail, empty.password)
    const state = await context.storageState()
    await context.close()
    return state
  })()

  for (const shot of shots) {
    const variants: Array<{ theme: Theme; mobile: boolean; suffix: string }> = [{ theme: "dark", mobile: false, suffix: "dark" }]
    if (shot.themes?.includes("light")) variants.push({ theme: "light", mobile: false, suffix: "light" })
    if (shot.mobile) variants.push({ theme: "dark", mobile: true, suffix: "mobile" })
    for (const variant of variants) {
      const context = await newContext(browser, variant.theme, variant.mobile, shot.signedOut ? undefined : shot.empty ? emptyStorage : storage)
      const target = await context.newPage()
      try {
        await target.goto(shot.path)
        await settle(target)
        await shot.prepare?.(target)
        await save(target, `${shot.name}--${variant.suffix}`)
      } catch (error) {
        console.error(`shot ${shot.name} ${variant.suffix} failed: ${(error as Error).message.split("\n")[0]}`)
      } finally {
        await context.close()
      }
    }
  }
  await browser.close()
  stop()
  const files = readdirSync(OUT)
  const total = files.reduce((sum, file) => sum + readFileSync(path.join(OUT, file)).length, 0)
  console.log(`${files.length} screenshots, ${(total / 1024 / 1024).toFixed(1)} MB in docs/ui/${label}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : "screenshots failed")
  process.exit(1)
})
