/**
 * LOCAL ONLY. Measures the production build against the local Supabase stack.
 *
 *   npm run perf:measure -- baseline      # writes perf-results/baseline.json and .md
 *
 * Needs a build from `npx tsx e2e/support/serve.ts build` and the dataset from
 * scripts/perf/seed-dataset.ts. It starts its own fake OpenAI server and
 * `next start` (port 3100, PERF_TIMING=1), then for each page records:
 * - first-load JS: script bytes the browser downloads on a cold load;
 * - server render: full HTML stream time for a signed-in fetch, median of 5,
 *   with the Supabase calls the server made (from PERF_TIMING logs);
 * - Lighthouse performance, accessibility, and best-practices, median of 3;
 * - the 10 slowest statements from pg_stat_statements, and a second pass with
 *   auto_explain on for PostgREST's role to capture EXPLAIN ANALYZE plans.
 * Every database setting it changes is restored before it exits.
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

import { chromium, type BrowserContext } from "@playwright/test"

import { APP_PORT, FAKE_OPENAI_PORT, LOCAL_SUPABASE_URL, ROOT, STATE_DIR, localDevEnv } from "../../e2e/support/local-env"
import { psql } from "../../e2e/support/seed"

const label = process.argv[2] ?? "run"
/** `--plans-only` reruns just the EXPLAIN pass and adds its plans to an existing result file. */
const plansOnly = process.argv.includes("--plans-only")
const BASE = `http://127.0.0.1:${APP_PORT}`
const OUT = path.join(ROOT, "perf-results")
const PLAN_ROLE = "authenticator"
const EXPLAIN_SETTINGS = [
  "auto_explain.log_min_duration",
  "auto_explain.log_analyze",
  "auto_explain.log_format",
  "auto_explain.log_nested_statements",
  "auto_explain.log_parameter_max_length",
]

type PageResult = {
  name: string
  path: string
  /** Scripts the document references (first load), and every script fetched by network idle (adds route prefetches). */
  js: { requests: number; transferKb: number; decodedKb: number; idleRequests: number; idleTransferKb: number; idleDecodedKb: number }
  server: { medianMs: number; supabaseCalls: number; supabaseMs: number; authCalls: number }
  lighthouse: { performance: number; accessibility: number; bestPractices: number; lcpMs: number; tbtMs: number }
}

const localAnonKey = () => localDevEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function start(command: string, args: string[], env: NodeJS.ProcessEnv, onLine?: (line: string) => void): ChildProcess {
  const child = spawn(command, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] })
  let buffer = ""
  child.stdout!.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8")
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) onLine?.(line)
  })
  child.stderr!.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  return child
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

async function signedInContext(context: BrowserContext, user: { email: string; password: string }) {
  const page = await context.newPage()
  await page.goto(`${BASE}/login`)
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL("**/dashboard")
  await page.close()
}

async function main() {
  const user = JSON.parse(readFileSync(path.join(STATE_DIR, "perf-user.json"), "utf8")) as { email: string; password: string }
  const logs: string[] = []
  const fake = start("npx", ["tsx", "e2e/support/fake-openai.ts"], process.env)
  const app = start("npx", ["tsx", "e2e/support/serve.ts", "start", "on"], { ...process.env, PERF_TIMING: "1" }, (line) => {
    if (line.startsWith("[perf] ")) logs.push(line)
  })
  const stop = () => {
    app.kill("SIGTERM")
    fake.kill("SIGTERM")
  }
  process.on("exit", stop)
  await waitFor(`http://127.0.0.1:${FAKE_OPENAI_PORT}`)
  await waitFor(`${BASE}/login`)

  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL: BASE })
  await signedInContext(context, user)
  const cookie = (await context.cookies(BASE)).map((entry) => `${entry.name}=${entry.value}`).join("; ")

  // Dynamic pages: the first application, and a fit analysis (created once through the fake provider).
  const page = await context.newPage()
  await page.goto("/applications")
  await page.locator('table a[href^="/applications/"]').first().waitFor()
  const applicationHref = await page.locator('table a[href^="/applications/"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? "").find((href) => /^\/applications\/[0-9a-f-]{36}$/.test(href)),
  )
  if (!applicationHref) throw new Error("No application detail link found.")
  await page.goto("/analyze")
  await page.getByRole("region", { name: "Past analyses" }).waitFor()
  let analysisHref = await page.getByRole("region", { name: "Past analyses" }).getByRole("link").first().getAttribute("href").catch(() => null)
  if (!analysisHref) {
    await page.getByLabel("Title").fill("Staff Platform Engineer")
    await page.getByLabel("Company").fill("Perf Company 001")
    await page
      .getByLabel(/^Job description/)
      .fill(
        "Staff Platform Engineer at Perf Company. You will design TypeScript services backed by PostgreSQL. You have 5 years of experience building distributed systems. You care about reliable on-call practices and clear runbooks. Experience with Kubernetes is preferred.",
      )
    await page.getByRole("button", { name: "Analyze fit" }).click()
    await page.waitForURL(/\/analyze\/[0-9a-f-]{36}/, { timeout: 30_000 })
    analysisHref = new URL(page.url()).pathname
  }
  await page.close()

  const pages: Array<{ name: string; path: string; signedOut?: boolean }> = [
    { name: "login", path: "/login", signedOut: true },
    { name: "dashboard", path: "/dashboard" },
    { name: "applications list", path: "/applications" },
    { name: "application detail", path: applicationHref! },
    { name: "jobs", path: "/jobs" },
    { name: "analyze result", path: analysisHref! },
    { name: "resumes", path: "/resumes" },
    { name: "career", path: "/career" },
    { name: "networking", path: "/networking" },
    { name: "daily tasks", path: "/daily-tasks" },
  ]

  // The session cookie goes to Lighthouse in a gitignored file, never on the command line.
  mkdirSync(OUT, { recursive: true })
  const headersFile = path.join(OUT, ".lighthouse-headers.json")
  writeFileSync(headersFile, JSON.stringify({ Cookie: cookie }), { mode: 0o600 })
  process.on("exit", () => rmSync(headersFile, { force: true }))

  const resultFile = path.join(OUT, `${label}.json`)
  const saved = plansOnly ? (JSON.parse(readFileSync(resultFile, "utf8")) as { results: PageResult[]; slow: Array<{ meanMs: number; calls: number; query: string }> }) : null
  if (!plansOnly) psql("select pg_stat_statements_reset();", false, "supabase_admin")
  const results: PageResult[] = saved?.results ?? []
  const chromePath = chromium.executablePath()
  for (const target of plansOnly ? [] : pages) {
    // First-load JS on a cold cache.
    const cold = target.signedOut ? await browser.newContext({ baseURL: BASE }) : await browser.newContext({ baseURL: BASE, storageState: await context.storageState() })
    const probe = await cold.newPage()
    const scripts: Array<Promise<{ path: string; transfer: number; decoded: number }>> = []
    probe.on("response", (response) => {
      if (response.request().resourceType() !== "script") return
      scripts.push(
        (async () => {
          const sizes = await response.request().sizes()
          const body = await response.body().catch(() => Buffer.alloc(0))
          return { path: new URL(response.url()).pathname, transfer: sizes.responseBodySize, decoded: body.length }
        })(),
      )
    })
    const document = await probe.goto(target.path, { waitUntil: "networkidle" })
    const html = (await document?.text()) ?? ""
    const referenced = new Set([...html.matchAll(/\/_next\/static\/[^"'\s)]+\.js/g)].map((match) => match[0]))
    const idle = await Promise.all(scripts)
    const sized = idle.filter((entry) => referenced.has(entry.path))
    await cold.close()

    // Server render time and Supabase calls, warm, median of 5.
    const times: number[] = []
    const counts: Array<{ calls: number; ms: number; auth: number }> = []
    for (let run = 0; run < 6; run++) {
      const before = logs.length
      const started = performance.now()
      const response = await fetch(`${BASE}${target.path}`, { headers: target.signedOut ? {} : { cookie }, redirect: "manual" })
      await response.text()
      const elapsed = performance.now() - started
      await new Promise((resolve) => setTimeout(resolve, 150))
      if (run === 0) continue
      const lines = logs.slice(before).filter((line) => line.startsWith("[perf] supabase "))
      times.push(elapsed)
      counts.push({
        calls: lines.length,
        ms: lines.reduce((sum, line) => sum + Number(/ ([\d.]+)ms$/.exec(line)?.[1] ?? 0), 0),
        auth: lines.filter((line) => line.includes(" /auth/v1/")).length,
      })
    }

    // Lighthouse CLI (a subprocess: its in-page code must not go through tsx), median of 3.
    const scores: Array<PageResult["lighthouse"]> = []
    for (let run = 0; run < 3; run++) {
      const report = path.join(OUT, `.lighthouse-${run}.json`)
      execFileSync(
        path.join(ROOT, "node_modules/.bin/lighthouse"),
        [
          `${BASE}${target.path}`,
          "--output=json",
          `--output-path=${report}`,
          "--quiet",
          "--only-categories=performance,accessibility,best-practices",
          `--chrome-path=${chromePath}`,
          "--chrome-flags=--headless=new --no-first-run",
          ...(target.signedOut ? [] : [`--extra-headers=${headersFile}`]),
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      )
      const lhr = JSON.parse(readFileSync(report, "utf8")) as {
        categories: Record<string, { score: number | null } | undefined>
        audits: Record<string, { numericValue?: number } | undefined>
      }
      rmSync(report)
      scores.push({
        performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
        bestPractices: Math.round((lhr.categories["best-practices"]?.score ?? 0) * 100),
        lcpMs: Math.round(Number(lhr.audits["largest-contentful-paint"]?.numericValue ?? 0)),
        tbtMs: Math.round(Number(lhr.audits["total-blocking-time"]?.numericValue ?? 0)),
      })
    }

    results.push({
      name: target.name,
      path: target.path.replace(/[0-9a-f-]{36}/g, "[id]"),
      js: {
        requests: sized.length,
        transferKb: Math.round(sized.reduce((sum, entry) => sum + entry.transfer, 0) / 102.4) / 10,
        decodedKb: Math.round(sized.reduce((sum, entry) => sum + entry.decoded, 0) / 102.4) / 10,
        idleRequests: idle.length,
        idleTransferKb: Math.round(idle.reduce((sum, entry) => sum + entry.transfer, 0) / 102.4) / 10,
        idleDecodedKb: Math.round(idle.reduce((sum, entry) => sum + entry.decoded, 0) / 102.4) / 10,
      },
      server: {
        medianMs: Math.round(median(times)),
        supabaseCalls: median(counts.map((entry) => entry.calls)),
        supabaseMs: Math.round(median(counts.map((entry) => entry.ms))),
        authCalls: median(counts.map((entry) => entry.auth)),
      },
      lighthouse: {
        performance: median(scores.map((entry) => entry.performance)),
        accessibility: median(scores.map((entry) => entry.accessibility)),
        bestPractices: median(scores.map((entry) => entry.bestPractices)),
        lcpMs: median(scores.map((entry) => entry.lcpMs)),
        tbtMs: median(scores.map((entry) => entry.tbtMs)),
      },
    })
    console.log(`measured ${target.name}`)
  }

  // Ten slowest statements by mean time during the measured runs.
  const slow = saved?.slow ?? psql(
    `select round(mean_exec_time::numeric, 2) || E'\\t' || calls || E'\\t' || regexp_replace(query, '\\s+', ' ', 'g')
       from pg_stat_statements
      where query ~* '\\m(from|update|insert into)\\s+"?public"?\\.'
        and query !~* 'pg_stat_statements'
      order by mean_exec_time desc limit 10;`,
    true,
    "supabase_admin",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [mean, calls, query] = line.split("\t")
      return { meanMs: Number(mean), calls: Number(calls), query: query! }
    })

  // Measurements are on disk before the plan pass, so a failure there loses nothing.
  writeFileSync(resultFile, JSON.stringify({ label, at: new Date().toISOString(), results, slow, plans: [] }, null, 2))

  // Second pass for plans: auto_explain on for PostgREST's role, one visit per page, then restored.
  const since = new Date().toISOString()
  const restorePlans = () =>
    psql(
      [
        ...EXPLAIN_SETTINGS.map((setting) => `alter role ${PLAN_ROLE} reset ${setting};`),
        `select pg_terminate_backend(pid) from pg_stat_activity where usename = '${PLAN_ROLE}' and pid <> pg_backend_pid();`,
      ].join("\n"),
      false,
      "supabase_admin",
    )
  // An interrupted run still turns auto_explain off.
  const onSignal = () => {
    restorePlans()
    process.exit(130)
  }
  process.once("SIGINT", onSignal)
  process.once("SIGTERM", onSignal)
  psql(
    [
      `alter role ${PLAN_ROLE} set auto_explain.log_min_duration = 0;`,
      `alter role ${PLAN_ROLE} set auto_explain.log_analyze = on;`,
      `alter role ${PLAN_ROLE} set auto_explain.log_format = 'text';`,
      `alter role ${PLAN_ROLE} set auto_explain.log_nested_statements = on;`,
      // Plans only: bind parameters (ids, search text) are not logged.
      `alter role ${PLAN_ROLE} set auto_explain.log_parameter_max_length = 0;`,
      `select pg_terminate_backend(pid) from pg_stat_activity where usename = '${PLAN_ROLE}' and pid <> pg_backend_pid();`,
    ].join("\n"),
    false,
    "supabase_admin",
  )
  try {
    // PostgREST reconnects and reloads its schema cache after its sessions end. Wait for it,
    // then until a signed-in page renders again.
    await new Promise((resolve) => setTimeout(resolve, 2000))
    for (let attempt = 0; attempt < 60; attempt++) {
      const status = await fetch(`${LOCAL_SUPABASE_URL}/rest/v1/companies?select=id&limit=1`, { headers: { apikey: localAnonKey() } })
        .then((response) => response.status)
        .catch(() => 0)
      if (status === 200) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
    for (let attempt = 0; attempt < 40; attempt++) {
      const html = await fetch(`${BASE}/dashboard`, { headers: { cookie } })
        .then((response) => (response.ok ? response.text() : ""))
        .catch(() => "")
      if (html.includes("Active applications")) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    for (const round of [1, 2]) {
      for (const target of pages.filter((entry) => !entry.signedOut)) {
        await fetch(`${BASE}${target.path}`, { headers: { cookie } })
          .then((response) => response.text())
          .catch(() => console.error(`plan pass ${round}: ${target.name} did not load`))
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  } finally {
    restorePlans()
    process.off("SIGINT", onSignal)
    process.off("SIGTERM", onSignal)
  }
  // Postgres logs to stderr, and `docker logs` keeps the container's streams apart.
  const logged = spawnSync("docker", ["logs", "--since", since, "supabase_db_job-application-tracker"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  const dbLog = `${logged.stdout ?? ""}\n${logged.stderr ?? ""}`
  const plans = dbLog
    .split(/\n(?=\S*.*LOG:\s+duration: )/)
    .filter((entry) => entry.includes("Query Text:"))
    .map((entry) => ({
      ms: Number(/duration: ([\d.]+) ms/.exec(entry)?.[1] ?? 0),
      text: (/Query Text: ([\s\S]*?)\n\s*(?=[A-Z][a-zA-Z ]+ \(cost|[A-Z][a-zA-Z ]+  \(|Result|Aggregate|Limit|Sort|Seq Scan|Index|Nested|Hash|Subquery|CTE|Append|Gather|Unique|Merge|Bitmap|Function|Materialize|WindowAgg|ProjectSet|Values)/.exec(entry)?.[1] ?? "").trim(),
      plan: entry,
    }))
    .filter((entry) => /from\s+"?public"?\./i.test(entry.text))
    .sort((left, right) => right.ms - left.ms)
    .slice(0, 10)

  await browser.close()
  stop()

  writeFileSync(resultFile, JSON.stringify({ label, at: new Date().toISOString(), results, slow, plans }, null, 2))
  const table = [
    "| Page | First-load JS KB (transfer / decoded, requests) | All JS by network idle KB (transfer / decoded, requests) | Server render ms (median of 5) | Supabase calls (auth) | Supabase ms | Lighthouse perf / a11y / best | LCP ms | TBT ms |",
    "|---|---|---|---|---|---|---|---|---|",
    ...results.map(
      (row) =>
        `| ${row.name} \`${row.path}\` | ${row.js.transferKb} / ${row.js.decodedKb} (${row.js.requests}) | ${row.js.idleTransferKb} / ${row.js.idleDecodedKb} (${row.js.idleRequests}) | ${row.server.medianMs} | ${row.server.supabaseCalls} (${row.server.authCalls}) | ${row.server.supabaseMs} | ${row.lighthouse.performance} / ${row.lighthouse.accessibility} / ${row.lighthouse.bestPractices} | ${row.lighthouse.lcpMs} | ${row.lighthouse.tbtMs} |`,
    ),
  ].join("\n")
  const slowTable = [
    "| # | Mean ms | Calls | Statement (normalized, truncated) |",
    "|---|---|---|---|",
    ...slow.map((row, index) => `| ${index + 1} | ${row.meanMs} | ${row.calls} | \`${row.query.slice(0, 220).replace(/\|/g, "\\|")}\` |`),
  ].join("\n")
  writeFileSync(path.join(OUT, `${label}.md`), `${table}\n\n${slowTable}\n`)
  console.log(`${table}\n\n${slowTable}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : "perf run failed")
  process.exit(1)
})
