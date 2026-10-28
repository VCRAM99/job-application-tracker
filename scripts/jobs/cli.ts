/**
 * Recommended jobs operator CLI. See docs/jobs.md, "Operator runbook".
 *
 *   npx tsx --conditions=react-server scripts/jobs/cli.ts <command> [flags]
 *
 * Commands:
 *   preview <provider> <identifier> [--region eu]   Live fetch, no database. Needs JOB_INGESTION_ENABLED=true in the shell.
 *   register --provider --identifier --employer-name [--employer-domain] [--region] [--slug]
 *            --usage --attribution --retention --fields title,location,urls
 *   approve  --slug [--status draft|approved|revoked] [--terms unclear|permitted|restricted]
 *            [--refresh-limit 0-24] [--live] --usage --attribution --retention --fields ...
 *   refresh [--fixtures]                             Run the ingestion runner once. Needs JOB_INGESTION_ENABLED=true in the shell.
 *                                                    --fixtures reads src/lib/jobs/sources/fixtures instead of the network,
 *                                                    and is refused for --target production.
 *
 * Every database command targets local Supabase (.env.development.local, http://127.0.0.1:54321)
 * unless --target production is passed. Production reads .env.local and asks for the project ref.
 * Secret values are never printed.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline/promises"

import { catalogCaller, publishableClient, type CatalogCaller } from "../../src/lib/jobs/catalog-rpc"
import { jobIngestionEnabled } from "../../src/lib/jobs/flags"
import { fetchSourcePages, runIngestion, type IngestionSource } from "../../src/lib/jobs/ingest"
import { approvePayload, parseArgs, registerPayload, resolveTarget, sourceSlug } from "../../src/lib/jobs/operator"
import { jobCatalogSecret } from "../../src/lib/jobs/proof"

const args = parseArgs(process.argv.slice(2))

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function readProjectFile(name: string): string | null {
  try {
    return readFileSync(path.join(process.cwd(), name), "utf8")
  } catch {
    return null
  }
}

async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await prompt.question(question)
  } finally {
    prompt.close()
  }
}

function fixturePayload(provider: string): unknown {
  if (provider !== "greenhouse" && provider !== "lever" && provider !== "ashby") fail("Unknown provider.")
  return JSON.parse(readFileSync(path.join(process.cwd(), "src/lib/jobs/sources/fixtures", `${provider}.json`), "utf8"))
}

function tally(values: Array<string | null>): string {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value ?? "(none)", (counts.get(value ?? "(none)") ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, total]) => `${value} (${total})`)
    .join(", ")
}

async function preview() {
  const [provider = "", identifier = ""] = args.positional
  if (!jobIngestionEnabled(process.env)) fail("Set JOB_INGESTION_ENABLED=true in the shell for this command.")
  const region = args.flags.region === "eu" ? "eu" : "global"
  const source: IngestionSource = {
    slug: sourceSlug(provider, identifier),
    provider,
    sourceIdentifier: identifier,
    region,
    employerName: typeof args.flags["employer-name"] === "string" ? args.flags["employer-name"] : null,
    employerDomain: typeof args.flags["employer-domain"] === "string" ? args.flags["employer-domain"] : "",
    accessMethod: "",
    approvedUsage: "",
    attributionRequirements: "",
    retentionRestrictions: "",
    allowedStorageFields: [],
    refreshLimitPerDay: 0,
    approvalStatus: "draft",
    termsStatus: "unclear",
    liveIngestionEnabled: false,
  }
  console.warn(`Live read of ${provider} board "${identifier}" (${region}). Nothing is written to a database.`)
  const page = await fetchSourcePages(source, new Date(), { permitLiveFetch: true })
  const jobs = page.jobs
  console.log(`postings: ${jobs.length} (rejected ${page.rejected}, complete ${page.complete})`)
  console.log(`titles: ${jobs.slice(0, 15).map((job) => job.title).join(" | ")}${jobs.length > 15 ? " | …" : ""}`)
  console.log(`locations: ${tally(jobs.map((job) => job.locationText))}`)
  console.log(`countries: ${tally(jobs.map((job) => job.countryCode))}`)
  console.log(`work arrangement: ${tally(jobs.map((job) => job.workArrangement))}`)
  const paid = jobs.filter((job) => job.compensationMin != null || job.compensationMax != null).length
  console.log(`compensation present: ${paid} of ${jobs.length}`)
  console.log(`application method: ${tally(jobs.map((job) => job.applicationMethod))}`)
}

async function catalog(action: string): Promise<{ call: CatalogCaller; target: "local" | "production" }> {
  const target = await resolveTarget({
    flag: args.flags.target,
    action,
    readFile: readProjectFile,
    shellEnv: process.env,
    ask,
    print: (line) => console.log(line),
  })
  if (!target.ok) fail(target.message)
  const secret = jobCatalogSecret(target.env)
  if (!secret) fail("JOB_CATALOG_WRITE_SECRET is missing or shorter than 32 characters in the target file.")
  console.warn(`Target: ${target.target} ${target.host}`)
  const client = publishableClient(target.env.NEXT_PUBLIC_SUPABASE_URL ?? "", target.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "")
  return { call: catalogCaller(client, secret), target: target.target }
}

function report(result: { data: unknown; error: { message: string; code?: string } | null }) {
  if (result.error) fail(`Database refused the request (${result.error.code ?? "no code"}): ${result.error.message}`)
  console.log(JSON.stringify(result.data, null, 2))
}

async function main() {
  if (args.command === "preview") return preview()
  if (args.command === "register") {
    const built = registerPayload(args.flags)
    if (!built.ok) fail(built.message)
    const { call } = await catalog(`register source ${String(built.payload.slug)} as a draft`)
    return report(await call("register-source", JSON.stringify({ ...built.payload, now: new Date().toISOString() })))
  }
  if (args.command === "approve") {
    const built = approvePayload(args.flags)
    if (!built.ok) fail(built.message)
    const { slug, approvalStatus, termsStatus, refreshLimitPerDay, liveIngestionEnabled } = built.payload
    const { call } = await catalog(
      `set ${String(slug)} to ${String(approvalStatus)}, terms ${String(termsStatus)}, refresh ${String(refreshLimitPerDay)}/day, live ${String(liveIngestionEnabled)}`,
    )
    return report(await call("approve-source", JSON.stringify({ ...built.payload, now: new Date().toISOString() })))
  }
  if (args.command === "refresh") {
    if (!jobIngestionEnabled(process.env)) fail("Set JOB_INGESTION_ENABLED=true in the shell for this command.")
    const fixtures = args.flags.fixtures === true
    if (fixtures && args.flags.target === "production") fail("--fixtures is for local Supabase only.")
    const { call, target } = await catalog(`refresh every approved live source once${fixtures ? " from fixtures" : ""}`)
    if (fixtures && target !== "local") fail("--fixtures is for local Supabase only.")
    const summary = await runIngestion({
      call,
      env: process.env,
      fetchSource: fixtures
        ? (source, now) => fetchSourcePages(source, now, { permitLiveFetch: false, load: async () => fixturePayload(source.provider) })
        : undefined,
    })
    console.log(JSON.stringify(summary, null, 2))
    if (summary.status !== "completed") process.exit(1)
    return
  }
  fail("Usage: preview <provider> <identifier> | register ... | approve ... | refresh. See the header of scripts/jobs/cli.ts.")
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? `Failed: ${error.message}` : "Failed.")
})
