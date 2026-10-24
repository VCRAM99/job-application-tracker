// @vitest-environment node

import { execFileSync } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { jobOperationProof, type JobOperation } from "@/lib/jobs/proof"

const url = process.env.LOCAL_SUPABASE_URL ?? ""
const anon = process.env.LOCAL_SUPABASE_ANON_KEY ?? ""
const service = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? ""
const docker = process.env.DOCKER_BIN ?? "docker"
const enabled = url === "http://127.0.0.1:54321" && anon.length > 20 && service.length > 20
const slug = `greenhouse:m21-${randomUUID().slice(0, 8)}`
const secret = randomBytes(24).toString("hex")

function localDbBound() {
  try {
    const output = execFileSync(docker, ["port", "supabase_db_job-application-tracker", "5432"], {
      encoding: "utf8",
    })
    return output.split("\n").some((line) => /^(127\.0\.0\.1|0\.0\.0\.0|\[::\]):54322$/.test(line.trim()))
  } catch {
    return false
  }
}

function psql(sql: string) {
  return execFileSync(
    docker,
    ["exec", "-i", "supabase_db_job-application-tracker", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"],
    { encoding: "utf8", input: sql },
  ).trim()
}

type Session = { token: string; id: string; email: string }

async function authAdmin(path: string, body: unknown) {
  const response = await fetch(`${url}/auth/v1${path}`, {
    method: "POST",
    headers: {
      apikey: service,
      authorization: `Bearer ${service}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as { id?: string; msg?: string }
  if (!response.ok || !payload.id) {
    throw new Error(`local auth admin failed (${response.status})`)
  }
  return payload.id
}

async function signIn(email: string, password: string) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const payload = (await response.json()) as { access_token?: string }
  if (!response.ok || !payload.access_token) throw new Error(`local sign-in failed (${response.status})`)
  return payload.access_token
}

async function rest(token: string | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("apikey", anon)
  headers.set("content-type", "application/json")
  headers.set("prefer", "return=representation")
  if (token) headers.set("authorization", `Bearer ${token}`)
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers })
}

async function operate(operation: JobOperation, payload: unknown) {
  const text = JSON.stringify(payload)
  const proof = jobOperationProof(secret, operation, text)
  const functions: Record<JobOperation, string> = {
    "apply-catalog": "apply_job_catalog",
    "register-source": "register_job_source",
    "approve-source": "approve_job_source",
    "record-source-failure": "record_job_source_failure",
    "record-alerts": "record_job_alerts",
    "collect-alerts": "collect_alert_workspace",
  }
  const response = await rest(null, `rpc/${functions[operation]}`, {
    method: "POST",
    body: JSON.stringify({ p_payload: text, p_proof: proof }),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`catalog rpc failed (${response.status})`)
  return body as Record<string, unknown>
}

describe.skipIf(!enabled)("local postgres and postgrest", () => {
  const password = `Local-${randomUUID()}`
  let ada: Session
  let grace: Session
  let postingId = ""
  const bound = localDbBound()

  beforeAll(async () => {
    if (!bound) return
    psql(`update public.job_catalog_gate set secret = '${secret}' where id = 1;`)
    const emailA = `m21-a-${randomUUID()}@example.com`
    const emailB = `m21-b-${randomUUID()}@example.com`
    ada = {
      email: emailA,
      id: await authAdmin("/admin/users", { email: emailA, password, email_confirm: true }),
      token: "",
    }
    grace = {
      email: emailB,
      id: await authAdmin("/admin/users", { email: emailB, password, email_confirm: true }),
      token: "",
    }
    ada.token = await signIn(emailA, password)
    grace.token = await signIn(emailB, password)
  }, 30000)

  afterAll(async () => {
    if (!bound || !ada) return
    psql(`
      delete from public.job_postings where source_id in (select id from public.job_sources where slug = '${slug}');
      delete from public.job_source_runs where source_id in (select id from public.job_sources where slug = '${slug}');
      delete from public.job_processing_locks where name = 'catalog:${slug}';
      delete from public.catalog_employers where normalized_name = 'm21 security';
      delete from public.job_sources where slug = '${slug}';
    `)
    psql("update public.job_catalog_gate set secret = null where id = 1;")
    await fetch(`${url}/auth/v1/admin/users/${ada.id}`, {
      method: "DELETE",
      headers: { apikey: service, authorization: `Bearer ${service}` },
    })
    await fetch(`${url}/auth/v1/admin/users/${grace.id}`, {
      method: "DELETE",
      headers: { apikey: service, authorization: `Bearer ${service}` },
    })
  })

  it("requires the disposable database to be bound to localhost", () => {
    expect(bound).toBe(true)
  })

  it("rejects catalog writes without a valid proof and blocks user writes", async () => {
    const anonRead = await rest(null, "job_postings?select=id")
    expect(anonRead.status).toBe(401)
    const forged = await rest(ada.token, "rpc/apply_job_catalog", {
      method: "POST",
      body: JSON.stringify({ p_payload: "{}", p_proof: "a".repeat(64) }),
    })
    expect(forged.ok).toBe(false)
    const insert = await rest(ada.token, "job_postings", {
      method: "POST",
      body: JSON.stringify({
        source_id: randomUUID(),
        source_job_id: "x",
        title: "Role",
        listing_url: "https://example.com/jobs/1",
        content_hash: "a".repeat(64),
      }),
    })
    expect(insert.ok).toBe(false)
  })

  it("approves one board without approving the provider template", async () => {
    expect(await operate("register-source", {
      provider: "greenhouse",
      slug,
      displayName: "M21 Security",
      sourceIdentifier: "m21security",
      region: "global",
      employerName: "M21 Security",
      employerDomain: "m21-security.example",
      accessMethod: "documented_https_json",
      approvedUsage: "Store normalized public posting fields for the local security check.",
      attributionRequirements: "Name Greenhouse and link the original posting.",
      retentionRestrictions: "Expire listings omitted from a successful full refresh.",
      allowedStorageFields: ["title", "location", "urls"],
    })).toMatchObject({ ok: true })
    expect(await operate("approve-source", {
      slug,
      approvalStatus: "approved",
      termsStatus: "permitted",
      liveIngestionEnabled: false,
      refreshLimitPerDay: 4,
      accessMethod: "documented_https_json",
      approvedUsage: "Store normalized public posting fields for the local security check.",
      attributionRequirements: "Name Greenhouse and link the original posting.",
      retentionRestrictions: "Expire listings omitted from a successful full refresh.",
      allowedStorageFields: ["title", "location", "urls"],
    })).toMatchObject({ ok: true })
    const templates = psql(
      "select approval_status || ':' || live_ingestion_enabled::text from public.job_sources where slug = 'provider:greenhouse';",
    )
    expect(templates).toBe("draft:false")
    const held = psql(
      `insert into public.job_processing_locks (name, owner, expires_at) values ('catalog:${slug}', 'holder', now() + interval '5 minutes') on conflict (name) do update set owner = 'holder', expires_at = now() + interval '5 minutes'; select 'held';`,
    )
    expect(held).toContain("held")
    expect(await operate("apply-catalog", {
      sourceSlug: slug,
      idempotencyKey: `held-${slug}`,
      completeSnapshot: false,
      postings: [],
    })).toMatchObject({ ok: false, reason: "lock_held" })
    psql(`delete from public.job_processing_locks where name = 'catalog:${slug}';`)
    const batch = {
      sourceSlug: slug,
      idempotencyKey: `batch-${slug}`,
      completeSnapshot: true,
      postings: [
        {
          employerName: "M21 Security",
          employerDomain: "m21-security.example",
          listingStatus: "active",
          contentHash: "b".repeat(64),
          provenance: { provider: "greenhouse" },
          titleTokens: ["security"],
          skillTokens: [],
          skills: [],
          descriptionText: "Local check",
          sourceJobId: "m21-1",
          title: "Security Analyst",
          locationText: "Ottawa",
          countryCode: "CA",
          workArrangement: "remote",
          employmentType: "full_time",
          seniority: "mid",
          compensationMin: null,
          compensationMax: null,
          currency: null,
          salaryPeriod: "unknown",
          postedAt: "2026-10-18T00:00:00.000Z",
          listingUrl: "https://boards.greenhouse.io/m21security/jobs/1",
          applicationUrl: "https://boards.greenhouse.io/m21security/jobs/1",
          applicationMethod: "ats",
          requisitionId: null,
        },
      ],
    }
    expect(await operate("apply-catalog", batch)).toMatchObject({ ok: true, upserted: 1 })
    expect(await operate("apply-catalog", batch)).toMatchObject({ ok: true, reason: "duplicate" })
    const visible = await rest(ada.token, "job_postings?select=id,title&title=eq.Security%20Analyst")
    const rows = (await visible.json()) as Array<{ id: string; title: string }>
    expect(visible.ok).toBe(true)
    expect(rows[0]?.title).toBe("Security Analyst")
    postingId = rows[0]?.id ?? ""
    const hidden = await rest(ada.token, "job_sources?select=slug&slug=eq.provider:greenhouse")
    expect(await hidden.json()).toEqual([])
  })

  it("isolates preferences, alerts, and application ownership", async () => {
    const preference = await rest(ada.token, "job_preferences", {
      method: "POST",
      body: JSON.stringify({ keywords: "security" }),
    })
    expect(preference.ok).toBe(true)
    const otherPreferences = await rest(grace.token, "job_preferences?select=keywords")
    expect(await otherPreferences.json()).toEqual([])
    const subscription = await rest(ada.token, "job_alert_subscriptions", {
      method: "POST",
      body: JSON.stringify({ cadence: "daily", timezone: "UTC", minimum_match: 40 }),
    })
    expect(subscription.ok).toBe(true)
    const otherAlerts = await rest(grace.token, "job_alert_subscriptions?select=id")
    expect(await otherAlerts.json()).toEqual([])

    const company = await rest(ada.token, "companies", {
      method: "POST",
      body: JSON.stringify({ name: "M21 Security" }),
    })
    const companyRows = (await company.json()) as Array<{ id: string }>
    expect(company.ok).toBe(true)
    const application = await rest(ada.token, "applications", {
      method: "POST",
      body: JSON.stringify({
        company_id: companyRows[0]?.id,
        job_title: "Security Analyst",
        job_url: "https://boards.greenhouse.io/m21security/jobs/1",
        status: "saved",
      }),
    })
    const applicationRows = (await application.json()) as Array<{ id: string }>
    expect(application.status).toBe(201)
    const graceView = await rest(grace.token, `applications?select=id&id=eq.${applicationRows[0]?.id}`)
    expect(await graceView.json()).toEqual([])
    const link = await rest(grace.token, "application_postings", {
      method: "POST",
      body: JSON.stringify({
        application_id: applicationRows[0]?.id,
        posting_id: postingId,
      }),
    })
    expect(link.ok).toBe(false)
  })

  it("lets only one of two concurrent matching applications succeed", async () => {
    const company = await rest(ada.token, "companies", {
      method: "POST",
      body: JSON.stringify({ name: "Race Employer" }),
    })
    const companyRows = (await company.json()) as Array<{ id: string }>
    const payload = {
      company_id: companyRows[0]?.id,
      job_title: "Concurrent Role",
      job_url: "https://jobs.example/concurrent/",
      status: "saved",
    }
    const [first, second] = await Promise.all([
      rest(ada.token, "applications", { method: "POST", body: JSON.stringify(payload) }),
      rest(ada.token, "applications", { method: "POST", body: JSON.stringify({ ...payload, job_url: "https://jobs.example/concurrent" }) }),
    ])
    expect([first.status, second.status].sort()).toEqual([201, 409])
    const graceCompany = await rest(grace.token, "companies", {
      method: "POST",
      body: JSON.stringify({ name: "Race Employer" }),
    })
    const graceRows = (await graceCompany.json()) as Array<{ id: string }>
    const copied = await rest(grace.token, "applications", {
      method: "POST",
      body: JSON.stringify({ ...payload, company_id: graceRows[0]?.id }),
    })
    expect(copied.status).toBe(201)
    const duplicate = await rest(ada.token, "rpc/find_application_duplicate", {
      method: "POST",
      body: JSON.stringify({ p_title: " concurrent role ", p_url: "https://jobs.example/concurrent" }),
    })
    expect(duplicate.ok).toBe(true)
    expect(await duplicate.json()).toEqual(expect.any(String))
  })
})
