/**
 * LOCAL ONLY. Recreates the e2e test users on the local Supabase stack and
 * seeds what the flows need: AI settings with a fake OpenAI key (the e2e
 * server sends every call to e2e/support/fake-openai.ts), verified facts, the
 * local accounting and catalog gates, and the fixture job catalog.
 *
 *   npx tsx --conditions=react-server e2e/support/seed.ts
 *
 * Refuses anything but http://127.0.0.1:54321 and the local Docker database.
 * Generated passwords are written to e2e/.state (gitignored) and never printed.
 */
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { encryptSecret, lastFour, parseKeyRing } from "../../src/lib/ai/crypto"
import { catalogCaller, publishableClient } from "../../src/lib/jobs/catalog-rpc"
import { fetchSourcePages, runIngestion } from "../../src/lib/jobs/ingest"
import { approvePayload, registerPayload } from "../../src/lib/jobs/operator"
import { LOCAL_SUPABASE_URL, ROOT, STATE_DIR, localDevEnv } from "./local-env"

export const E2E_EMAIL = "e2e-user@example.test"
/** Signs in and out in auth.spec.ts. Sign-out revokes every session of a user, so it is not the main user. */
export const E2E_AUTH_EMAIL = "e2e-auth@example.test"
const FAKE_OPENAI_KEY = "sk-e2e-local-fake-key-not-a-secret-0000"
const DB_CONTAINER = "supabase_db_job-application-tracker"

function supabaseStatus(): { anon: string; service: string } {
  const output = execFileSync("npx", ["supabase", "status", "-o", "env"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  const read = (name: string) => new RegExp(`^${name}="?([^"\\n]+)"?$`, "m").exec(output)?.[1] ?? ""
  if (read("API_URL") !== LOCAL_SUPABASE_URL) throw new Error(`Refusing: local Supabase API must be ${LOCAL_SUPABASE_URL}.`)
  return { anon: read("ANON_KEY"), service: read("SERVICE_ROLE_KEY") }
}

/** Runs SQL as the local database owner. Output is discarded so nothing echoes. */
export function psql(sql: string, capture = false, role = "postgres"): string {
  const ports = execFileSync("docker", ["port", DB_CONTAINER, "5432"], { encoding: "utf8" })
  if (!ports.split("\n").some((line) => /^(127\.0\.0\.1|0\.0\.0\.0|\[::\]):54322$/.test(line.trim()))) {
    throw new Error("Refusing: the local database container is not bound to port 54322.")
  }
  const output = execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", role, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qtA"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", capture ? "pipe" : "ignore", "pipe"],
  })
  return capture ? output : ""
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * Moves a user's AI usage rows out of the per-minute and per-day rate-limit windows, so a serial
 * suite of AI flows is not refused by the real limit (which is what a person would hit).
 */
export function clearAiRateWindow(email: string) {
  psql(`update public.ai_usage_events set created_at = created_at - interval '2 days' where user_id = (select id from auth.users where email = ${quote(email)});`)
}

export type Local = Awaited<ReturnType<typeof connectLocal>>

/** REST helpers for the local stack, plus the local accounting and catalog gates. */
export async function connectLocal() {
  const dev = localDevEnv()
  const { anon, service } = supabaseStatus()

  async function call(pathname: string, init: { method?: string; token?: string; body?: unknown; admin?: boolean; prefer?: string } = {}) {
    const key = init.admin ? service : anon
    const response = await fetch(`${LOCAL_SUPABASE_URL}${pathname}`, {
      method: init.method ?? "GET",
      headers: {
        apikey: key,
        authorization: `Bearer ${init.token ?? key}`,
        "content-type": "application/json",
        prefer: init.prefer ?? "return=representation",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const text = await response.text()
    // Status only: a body could echo request data.
    if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathname.split("?")[0]} failed (${response.status})`)
    return text ? JSON.parse(text) : null
  }

  psql(
    [
      `update public.ai_accounting_gate set secret = ${quote(dev.AI_ACCOUNTING_SECRET!)} where id = 1;`,
      dev.JOB_CATALOG_WRITE_SECRET ? `update public.job_catalog_gate set secret = ${quote(dev.JOB_CATALOG_WRITE_SECRET)} where id = 1;` : "",
    ].join("\n"),
  )
  return { dev, anon, call }
}

/** Deletes and recreates users (deleting cascades to all of their rows). Returns the first user's session. */
export async function recreateUsers(local: Local, emails: string[]) {
  const listed = (await local.call(`/auth/v1/admin/users?per_page=1000`, { admin: true })) as { users: Array<{ id: string; email: string }> }
  for (const user of listed.users.filter((entry) => emails.includes(entry.email))) {
    await local.call(`/auth/v1/admin/users/${user.id}`, { method: "DELETE", admin: true })
  }
  const password = `E2e-${randomBytes(18).toString("base64url")}`
  const ids: string[] = []
  for (const email of emails) {
    const created = (await local.call("/auth/v1/admin/users", { method: "POST", admin: true, body: { email, password, email_confirm: true } })) as { id: string }
    ids.push(created.id)
  }
  const session = (await local.call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: emails[0], password } })) as { access_token: string }
  return { id: ids[0]!, token: session.access_token, password }
}

/** BYOK OpenAI with a fake key, and a few verified career facts. */
export async function seedAiProfile(local: Local, user: { id: string; token: string }) {
  const { call, dev } = local
  const token = user.token
  await call("/rest/v1/ai_user_settings?on_conflict=user_id", { method: "POST", token, body: { user_id: user.id, execution_mode: "byok", provider: "openai" } })
  const ring = parseKeyRing({ AI_CREDENTIALS_KEY: dev.AI_CREDENTIALS_KEY, AI_CREDENTIALS_KEY_VERSION: dev.AI_CREDENTIALS_KEY_VERSION })
  if (!ring) throw new Error("AI_CREDENTIALS_KEY in .env.development.local is not a valid key ring.")
  const encrypted = encryptSecret(FAKE_OPENAI_KEY, ring)
  await call("/rest/v1/rpc/rotate_ai_credential", {
    method: "POST",
    token,
    body: {
      p_provider: "openai",
      p_key_version: encrypted.keyVersion,
      p_last_four: lastFour(FAKE_OPENAI_KEY),
      p_ciphertext: encrypted.ciphertext,
      p_nonce: encrypted.nonce,
      p_auth_tag: encrypted.authTag,
    },
  })
  const [profile] = (await call("/rest/v1/career_profiles", { method: "POST", token, body: { summary: "Backend engineer." } })) as Array<{ id: string }>
  const approved = new Date().toISOString()
  const facts: Array<[string, Record<string, unknown>]> = [
    ["employment_entries", { title: "Backend Engineer", organization: "Lumen Ridge Labs", start_date: "2021-02-01", is_current: true, evidence_excerpt: "Backend Engineer, Lumen Ridge Labs. Built TypeScript APIs on PostgreSQL." }],
    ["skill_entries", { name: "PostgreSQL", category: "Databases" }],
    ["skill_entries", { name: "TypeScript", category: "Languages" }],
    ["accomplishment_entries", { title: "Led the ledger migration", summary: "Moved services to per-service schemas with zero downtime." }],
  ]
  for (const [table, row] of facts) {
    await call(`/rest/v1/${table}`, { method: "POST", token, body: { ...row, profile_id: profile!.id, verification_state: "user_verified", approved_at: approved } })
  }
}

/** Registers, approves, and ingests one local fixture source through the operator code path. */
export async function loadCatalog(local: Local, identifier: string, fixture: unknown) {
  const secret = local.dev.JOB_CATALOG_WRITE_SECRET
  if (!secret) return
  const caller = catalogCaller(publishableClient(LOCAL_SUPABASE_URL, local.anon), secret)
  const record = { usage: "Local fixtures only.", attribution: "Fixture data.", retention: "Deleted on local reset.", fields: "title,location,urls" }
  const registered = registerPayload({ provider: "greenhouse", identifier, "employer-name": "Northwind", ...record })
  if (!registered.ok) throw new Error(registered.message)
  const slug = String(registered.payload.slug)
  const now = () => new Date().toISOString()
  const register = await caller("register-source", JSON.stringify({ ...registered.payload, now: now() }))
  if (register.error && !/exist|duplicate/i.test(register.error.message)) throw new Error(`register-source failed (${register.error.code ?? "no code"})`)
  const approved = approvePayload({ slug, status: "approved", terms: "permitted", "refresh-limit": "24", live: "true", ...record })
  if (!approved.ok) throw new Error(approved.message)
  const approve = await caller("approve-source", JSON.stringify({ ...approved.payload, now: now() }))
  if (approve.error) throw new Error(`approve-source failed (${approve.error.code ?? "no code"})`)
  const summary = await runIngestion({
    call: caller,
    env: { JOB_INGESTION_ENABLED: "true" },
    // Other local sources fail this run on purpose: a recorded failure never touches their postings.
    fetchSource: async (source, at) => {
      if (source.slug !== slug) throw new Error("not loaded in this run")
      return fetchSourcePages(source, at, { permitLiveFetch: false, load: async () => fixture })
    },
  })
  if (summary.status !== "completed") throw new Error(`fixture ingestion did not complete (${summary.status})`)
}

export function writeState(name: string, value: unknown) {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(path.join(STATE_DIR, name), JSON.stringify(value), { mode: 0o600 })
}

export async function seed() {
  const local = await connectLocal()
  const user = await recreateUsers(local, [E2E_EMAIL, E2E_AUTH_EMAIL])
  await seedAiProfile(local, user)
  await loadCatalog(local, "e2e-fixtures", JSON.parse(readFileSync(path.join(ROOT, "src/lib/jobs/sources/fixtures/greenhouse.json"), "utf8")))
  writeState("user.json", { email: E2E_EMAIL, authEmail: E2E_AUTH_EMAIL, password: user.password, id: user.id })
  console.log("e2e seed complete.")
}

if (require.main === module) {
  seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "e2e seed failed")
    process.exit(1)
  })
}
