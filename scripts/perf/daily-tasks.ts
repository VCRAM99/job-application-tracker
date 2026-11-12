/**
 * LOCAL ONLY. Times the Daily Tasks interactions the owner cares about, and takes screenshots.
 *
 *   npx tsx e2e/support/serve.ts build
 *   npm run perf:seed
 *   npx tsx --conditions=react-server scripts/perf/daily-tasks.ts before   # or: after
 *
 * Writes perf-results/daily-<label>.json and docs/ui/daily-tasks/<label>/*.webp.
 *
 * For each interaction, a capture-phase pointerdown listener in the page records t0. Then:
 * - "click → UI": the first animation frame where the expected change is on screen (checked
 *   every frame by a condition run in the page);
 * - "click → confirmed": when the server action's response body has been read in full (fetch
 *   wrapped in the page; server actions are POSTs with a Next-Action header).
 * Medians of REPEATS runs. Nothing is measured from Playwright's side, so its round trips do not
 * count.
 */
import { spawn, type ChildProcess } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { chromium, type BrowserContext, type Page } from "@playwright/test"
import sharp from "sharp"

import { APP_PORT, ROOT, STATE_DIR } from "../../e2e/support/local-env"
import { psql } from "../../e2e/support/seed"

const label = process.argv[2] === "after" ? "after" : "before"
const BASE = `http://127.0.0.1:${APP_PORT}`
const REPEATS = 7
const HABITS = ["Perf habit: stretch", "Perf habit: read", "Perf habit: walk", "Perf habit: plan tomorrow", "Perf habit: inbox zero"]

const median = (values: number[]) => {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  return Math.round((sorted[Math.floor(sorted.length / 2)] ?? Number.NaN) * 10) / 10
}

/** Its own process group, so stopping it also stops the `next start` it launches. */
function start(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(command, args, { cwd: ROOT, env, stdio: "ignore", detached: true })
}

function stop(child: ChildProcess) {
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM")
  } catch {}
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

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

/** Health tracking on, five daily habits, and no leftover perf meals for the perf user. */
function prepareData(email: string) {
  const user = `(select id from auth.users where email = ${quote(email)})`
  // Triggers off for this session: assign_user_id needs a signed-in request, and user_id is set here.
  psql(`
    set session_replication_role = replica;
    insert into public.user_preferences (user_id, health_tracking_enabled) values (${user}, true)
      on conflict (user_id) do update set health_tracking_enabled = true;
    delete from public.recurring_tasks where user_id = ${user} and title like 'Perf habit:%';
    insert into public.recurring_tasks (user_id, title, weekdays, status)
      select ${user}, title, array[1,2,3,4,5,6,7], 'active' from unnest(array[${HABITS.map(quote).join(",")}]) as title;
    delete from public.food_entries where user_id = ${user} and description like 'Perf meal%';
  `)
}

/**
 * Page-side timing. Passed as a string: tsx keeps function names with an esbuild helper
 * (__name) that does not exist in the page, so a serialized function would throw there.
 */
const INSTRUMENT = `
(() => {
  const state = { t0: 0, ui: 0, confirmed: 0, condition: null }
  window.__perf = state
  let observer = null
  function check() {
    if (state.ui || !state.t0) return
    let met = false
    try { met = Boolean(state.condition && state.condition()) } catch (error) {}
    if (met) { state.ui = performance.now(); if (observer) observer.disconnect(); return }
    if (performance.now() - state.t0 < 15000) requestAnimationFrame(check)
  }
  document.addEventListener("pointerdown", function () {
    state.t0 = performance.now(); state.ui = 0; state.confirmed = 0
    // Checked on every DOM change and every frame, whichever sees the change first.
    if (observer) observer.disconnect()
    observer = new MutationObserver(check)
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true })
    requestAnimationFrame(check)
  }, true)
  const original = window.fetch
  window.fetch = async function (input, init) {
    const response = await original(input, init)
    const headers = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined))
    const method = ((init && init.method) || (input instanceof Request ? input.method : "GET")).toUpperCase()
    if (method === "POST" && headers.has("next-action")) {
      response.clone().text().then(function () { state.confirmed = performance.now() })
    }
    return response
  }
})()
`

async function instrument(context: BrowserContext) {
  await context.addInitScript({ content: INSTRUMENT })
}

async function arm(page: Page, condition: string) {
  await page.evaluate((source) => {
    const perf = (window as unknown as { __perf: { condition: null | (() => boolean) } }).__perf
    perf.condition = new Function(`return (${source})`) as () => boolean
  }, condition)
}

async function result(page: Page, needConfirmation: boolean) {
  await page
    .waitForFunction(
    (need) => {
      const perf = (window as unknown as { __perf: { ui: number; confirmed: number } }).__perf
      return perf.ui > 0 && (!need || perf.confirmed > 0)
    },
    needConfirmation,
    { timeout: 20_000, polling: 50 },
  )
    .catch(async (error: unknown) => {
      const state = await page.evaluate(() => {
        const perf = (window as unknown as { __perf: { t0: number; ui: number; confirmed: number; condition: unknown } }).__perf
        let now: unknown
        try {
          now = (perf.condition as () => boolean)()
        } catch (error) {
          now = String(error)
        }
        return { t0: perf.t0, ui: perf.ui, confirmed: perf.confirmed, conditionNow: now, url: location.href }
      })
      throw new Error(`Interaction did not finish: ${JSON.stringify(state)} (${error instanceof Error ? error.message : "timeout"})`)
    })
  return page.evaluate(() => {
    const perf = (window as unknown as { __perf: { t0: number; ui: number; confirmed: number } }).__perf
    return { ui: perf.ui - perf.t0, confirmed: perf.confirmed ? perf.confirmed - perf.t0 : Number.NaN }
  })
}

/** Selectors differ between the old page and the new one; the measured actions are the same. */
const UI = {
  before: {
    // Old checklist: a submit button per habit whose screen-reader text says whether it is done.
    habit: (page: Page, title: string) => page.locator("form").filter({ hasText: title }).getByRole("button"),
    habitDone: (title: string) =>
      `[...document.querySelectorAll("form")].find((form) => form.textContent.includes(${JSON.stringify(title)}))?.textContent.includes("Completed.")`,
    addFood: async (page: Page, description: string) => {
      const form = page.locator("form").filter({ has: page.getByLabel("Food description") })
      await form.getByLabel("Food description").fill(description)
      await form.getByLabel("Calories").fill("420")
      await form.getByLabel("Protein grams").fill("31")
      return form.getByRole("button", { name: "Add food" })
    },
    nextDay: (page: Page) => page.getByRole("link", { name: "Next day" }),
    dateText: () => `document.querySelector("main").innerText`,
  },
  after: {
    habit: (page: Page, title: string) => page.getByRole("checkbox", { name: title }),
    habitDone: (title: string) =>
      `[...document.querySelectorAll('[role="checkbox"]')].find((box) => box.getAttribute("aria-label") === ${JSON.stringify(title)})?.getAttribute("aria-checked") === "true"`,
    addFood: async (page: Page, description: string) => {
      const form = page.getByRole("form", { name: "Add food" })
      await form.getByLabel("Food").fill(description)
      await form.getByLabel("Calories").fill("420")
      await form.getByLabel("Protein").fill("31")
      return form.getByRole("button", { name: "Add" })
    },
    nextDay: (page: Page) => page.getByRole("button", { name: "Next day" }),
    dateText: () => `document.querySelector("[data-selected-date]")?.getAttribute("data-selected-date")`,
  },
}[label]

async function measure(page: Page) {
  await page.goto(`${BASE}/daily-tasks`)
  await page.waitForLoadState("networkidle")
  const toggle = { ui: [] as number[], confirmed: [] as number[] }
  for (let run = 0; run < REPEATS; run++) {
    const title = HABITS[run % HABITS.length]!
    const done = await page.evaluate(new Function(`return ${UI.habitDone(title)}`) as () => boolean)
    await arm(page, `(${UI.habitDone(title)}) === ${!done}`)
    await UI.habit(page, title).click()
    const time = await result(page, true)
    toggle.ui.push(time.ui)
    toggle.confirmed.push(time.confirmed)
    // Let any re-render from the last action finish, so the next click lands on settled DOM.
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
  }

  const food = { ui: [] as number[], confirmed: [] as number[] }
  for (let run = 0; run < REPEATS; run++) {
    await page.goto(`${BASE}/daily-tasks`)
    await page.waitForLoadState("networkidle")
    const description = `Perf meal ${label} ${run} ${Date.now()}`
    const button = await UI.addFood(page, description)
    await arm(page, `document.querySelector("main").innerText.includes(${JSON.stringify(description)})`)
    await button.click()
    const time = await result(page, true)
    food.ui.push(time.ui)
    food.confirmed.push(time.confirmed)
  }

  const day = { ui: [] as number[] }
  await page.goto(`${BASE}/daily-tasks`)
  await page.waitForLoadState("networkidle")
  for (let run = 0; run < REPEATS; run++) {
    const before = await page.evaluate(new Function(`return ${UI.dateText()}`) as () => string)
    await arm(page, `(${UI.dateText()}) !== ${JSON.stringify(before)} && !document.querySelector("[data-day-loading]")`)
    await UI.nextDay(page).click()
    const time = await result(page, false)
    day.ui.push(time.ui)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
  }

  return {
    toggleHabit: { clickToUiMs: median(toggle.ui), clickToConfirmedMs: median(toggle.confirmed), runs: toggle },
    addFood: { clickToUiMs: median(food.ui), clickToConfirmedMs: median(food.confirmed), runs: food },
    nextDay: { clickToUiMs: median(day.ui), runs: day },
  }
}

/** A tidy, realistic day for screenshots: the timing runs leave many perf meals behind. */
function screenshotData(email: string) {
  const user = `(select id from auth.users where email = ${quote(email)})`
  const today = `(now() at time zone coalesce((select timezone from public.user_preferences where user_id = ${user}), 'UTC'))::date`
  psql(`
    set session_replication_role = replica;
    delete from public.food_entries where user_id = ${user} and (description like 'Perf meal%' or description like 'Sample:%');
    delete from public.recurring_task_completions where user_id = ${user} and local_date = ${today};
    insert into public.food_entries (user_id, local_date, description, calories, protein, entry_time) values
      (${user}, ${today}, 'Sample: oatmeal with berries', 380, 14, '08:10'),
      (${user}, ${today}, 'Sample: chicken rice bowl', 640, 46, '12:45');
    delete from public.water_entries where user_id = ${user} and local_date = ${today};
    delete from public.sleep_entries where user_id = ${user} and local_date = ${today};
    delete from public.step_entries where user_id = ${user} and local_date = ${today};
    insert into public.water_entries (user_id, local_date, amount_ml) values (${user}, ${today}, 1500), (${user}, ${today}, 750);
    insert into public.sleep_entries (user_id, local_date, minutes) values (${user}, ${today}, 445);
    insert into public.step_entries (user_id, local_date, steps) values (${user}, ${today}, 4200);
    -- Targets so each status shows: calories close to a cutting limit, protein under it,
    -- water reached, sleep close, steps below.
    insert into public.health_goals (user_id, calorie_target, protein_target, water_goal_ml, sleep_target_minutes, step_target, goal_mode, protein_direction)
      values (${user}, 1100, 120, 2000, 480, 8000, 'cut', 'reach')
      on conflict (user_id) do update set calorie_target = 1100, protein_target = 120, water_goal_ml = 2000, sleep_target_minutes = 480, step_target = 8000, goal_mode = 'cut', protein_direction = 'reach', hidden_metrics = null;
    insert into public.recurring_task_completions (user_id, task_id, local_date)
      select ${user}, id, ${today} from public.recurring_tasks where user_id = ${user} and title in ('Perf habit: stretch', 'Perf habit: read');
  `)
}

async function screenshots(browserContext: (theme: "dark" | "light", mobile: boolean) => Promise<BrowserContext>) {
  const dir = path.join(ROOT, "docs/ui/daily-tasks", label)
  mkdirSync(dir, { recursive: true })
  for (const [theme, mobile, name] of [["dark", false, "desktop-dark"], ["light", false, "desktop-light"], ["dark", true, "mobile-dark"]] as const) {
    const context = await browserContext(theme, mobile)
    const page = await context.newPage()
    await page.goto(`${BASE}/daily-tasks`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(800)
    const png = await page.screenshot({ fullPage: true })
    await sharp(png).webp({ quality: 80 }).toFile(path.join(dir, `${name}.webp`))
    await context.close()
  }
}

async function main() {
  const user = JSON.parse(readFileSync(path.join(STATE_DIR, "perf-user.json"), "utf8")) as { email: string; password: string }
  prepareData(user.email)
  const app = start("npx", ["tsx", "e2e/support/serve.ts", "start", "on"], process.env)
  const browser = await chromium.launch()
  try {
    await waitFor(`${BASE}/login`)
    const login = await browser.newContext()
    const page = await login.newPage()
    await page.goto(`${BASE}/login`)
    await page.getByLabel("Email").fill(user.email)
    await page.getByLabel("Password").fill(user.password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await page.waitForURL("**/dashboard")
    const storage = await login.storageState()
    await login.close()

    const context = await browser.newContext({ storageState: storage, viewport: { width: 1280, height: 900 } })
    await instrument(context)
    const local = await measure(await context.newPage())
    // Second pass with 150 ms of added round-trip latency between browser and server (Chrome's
    // network emulation), closer to a phone talking to a hosted app. Local Supabase answers in
    // about 1–5 ms, so the local pass hides any wait for the server.
    const slowPage = await context.newPage()
    const cdp = await context.newCDPSession(slowPage)
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: -1, uploadThroughput: -1 })
    const slow = await measure(slowPage)
    await context.close()
    const timings = { local, latency150: slow }

    screenshotData(user.email)
    await screenshots(async (theme, mobile) => {
      const shot = await browser.newContext({
        storageState: storage,
        colorScheme: theme,
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        deviceScaleFactor: mobile ? 2 : 1,
        isMobile: mobile,
        hasTouch: mobile,
      })
      await shot.addInitScript((value) => window.localStorage.setItem("theme", value), theme)
      return shot
    })

    mkdirSync(path.join(ROOT, "perf-results"), { recursive: true })
    writeFileSync(path.join(ROOT, "perf-results", `daily-${label}.json`), `${JSON.stringify({ label, at: new Date().toISOString(), repeats: REPEATS, timings }, null, 2)}\n`)
    for (const [name, run] of Object.entries(timings)) {
      console.log(name, JSON.stringify({ toggleUi: run.toggleHabit.clickToUiMs, toggleConfirmed: run.toggleHabit.clickToConfirmedMs, foodUi: run.addFood.clickToUiMs, foodConfirmed: run.addFood.clickToConfirmedMs, nextDay: run.nextDay.clickToUiMs }))
    }
  } finally {
    await browser.close()
    stop(app)
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
