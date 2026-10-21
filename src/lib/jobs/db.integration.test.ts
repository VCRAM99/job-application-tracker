// @vitest-environment node

import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { jobOperationProof, type JobOperation } from "@/lib/jobs/proof"
import { scorePosting } from "@/lib/jobs/score"

const migrationsDir = path.join(process.cwd(), "supabase/migrations")
const SECRET = "job-tracker-test-catalog-secret-32b"

const bootstrap = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`

function hash(): string {
  return "a".repeat(64)
}

describe("recommended jobs database", () => {
  let db: PGlite
  const ada = randomUUID()
  const grace = randomUUID()

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } })
    await db.exec(bootstrap)
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
    for (const file of files) {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"))
    }
    await db.query("insert into auth.users (id) values ($1), ($2)", [ada, grace])
    await db.query("update public.job_catalog_gate set secret = $1 where id = 1", [SECRET])
  }, 60000)

  afterAll(async () => {
    await db?.close()
  })

  async function asUser<T>(userId: string | null, run: () => Promise<T>) {
    if (userId) {
      await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false)`)
      await db.exec("set role authenticated")
    } else {
      await db.exec("set role anon")
    }
    try {
      return await run()
    } finally {
      await db.exec("reset role")
      await db.exec("select set_config('request.jwt.claim.sub', '', false)")
    }
  }

  async function operate(operation: JobOperation, payload: unknown) {
    const text = JSON.stringify(payload)
    const proof = jobOperationProof(SECRET, operation, text)
    const functions: Record<JobOperation, string> = {
      "apply-catalog": "apply_job_catalog",
      "register-source": "register_job_source",
      "approve-source": "approve_job_source",
      "record-source-failure": "record_job_source_failure",
      "record-alerts": "record_job_alerts",
      "collect-alerts": "collect_alert_workspace",
    }
    const result = await db.query<{ result: Record<string, unknown> }>(
      `select public.${functions[operation]}($1, $2) as result`,
      [text, proof],
    )
    return result.rows[0]?.result
  }

  it("matches the SQL score to the TypeScript estimate", async () => {
    const score = await db.query<{ job_match_score: number }>(
      `select public.job_match_score(
         array['postgresql','typescript'],
         array['postgresql','typescript'],
         array['backend','engineer'],
         array['backend','engineer','senior'],
         array['backend','engineer'],
         array['senior'],
         'senior',
         true,
         '2026-10-18T00:00:00Z',
         '2026-10-20T15:00:00Z'
       ) as job_match_score`,
    )
    const estimate = scorePosting(
      {
        skillTokens: ["postgresql", "typescript"],
        roleTokens: ["backend", "engineer"],
        experienceTokens: ["backend", "engineer"],
        seniorities: ["senior"],
      },
      {
        titleTokens: ["backend", "engineer", "senior"],
        skillTokens: ["postgresql", "typescript"],
        seniority: "senior",
        preferred: true,
        referenceAt: "2026-10-18T00:00:00.000Z",
      },
      new Date("2026-10-20T15:00:00.000Z"),
    )
    expect(score.rows[0]?.job_match_score).toBe(estimate.score)
  })

  it("isolates preferences and blocks shared catalog writes", async () => {
    await asUser(ada, () => db.query("insert into public.job_preferences (keywords, countries) values ('backend', '{CA}')"))
    const hidden = await asUser(grace, () => db.query("select keywords from public.job_preferences"))
    expect(hidden.rows).toEqual([])
    await expect(
      asUser(ada, () =>
        db.query(
          `insert into public.job_postings (
             source_id, source_job_id, title, listing_url, content_hash
           ) values ($1, 'x', 'Role', 'https://example.com/jobs/1', $2)`,
          [randomUUID(), hash()],
        ),
      ),
    ).rejects.toThrow()
    await expect(asUser(null, () => db.query("select id from public.job_postings"))).rejects.toThrow()
  })

  it("stores an approved fixture batch, filters it, and does not expire jobs after a failed refresh", async () => {
    await expect(
      db.query("select public.apply_job_catalog($1, $2)", [JSON.stringify({ sourceSlug: "missing" }), "a".repeat(64)]),
    ).rejects.toThrow(/not authorized/)

    const registered = await operate("register-source", {
      provider: "greenhouse",
      slug: "greenhouse:northwind",
      displayName: "Northwind",
      sourceIdentifier: "northwind",
      region: "global",
      employerName: "Northwind",
      employerDomain: "northwind.example",
      accessMethod: "documented_https_json",
      approvedUsage: "Store normalized public posting fields for signed-in recommendations.",
      attributionRequirements: "Name Greenhouse and link the original posting.",
      retentionRestrictions: "Expire listings omitted from a successful full refresh.",
      allowedStorageFields: ["title", "location", "urls"],
    })
    expect(registered).toMatchObject({ ok: true, created: true })

    await operate("approve-source", {
      slug: "greenhouse:northwind",
      approvalStatus: "approved",
      termsStatus: "permitted",
      liveIngestionEnabled: false,
      refreshLimitPerDay: 4,
      accessMethod: "documented_https_json",
      approvedUsage: "Store normalized public posting fields for signed-in recommendations.",
      attributionRequirements: "Name Greenhouse and link the original posting.",
      retentionRestrictions: "Expire listings omitted from a successful full refresh.",
      allowedStorageFields: ["title", "location", "urls"],
    })

    const common = {
      employerName: "Northwind",
      employerDomain: "northwind.example",
      listingStatus: "active",
      contentHash: hash(),
      provenance: { provider: "greenhouse" },
      titleTokens: ["backend", "engineer"],
      skillTokens: ["typescript"],
      skills: ["typescript"],
      descriptionText: "APIs",
    }
    const applied = await operate("apply-catalog", {
      sourceSlug: "greenhouse:northwind",
      idempotencyKey: "batch-1",
      completeSnapshot: true,
      postings: [
        {
          ...common,
          sourceJobId: "ca-1",
          title: "Backend Engineer",
          locationText: "Toronto, Canada",
          countryCode: "CA",
          workArrangement: "remote",
          employmentType: "full_time",
          seniority: "senior",
          compensationMin: 150000,
          compensationMax: 180000,
          currency: "CAD",
          salaryPeriod: "year",
          postedAt: "2026-10-18T00:00:00.000Z",
          listingUrl: "https://boards.greenhouse.io/northwind/jobs/ca-1",
          applicationUrl: "https://boards.greenhouse.io/northwind/jobs/ca-1",
          applicationMethod: "ats",
          requisitionId: "REQ-1",
        },
        {
          ...common,
          sourceJobId: "us-easy",
          title: "Easy Role",
          titleTokens: ["easy", "role"],
          locationText: "Austin",
          countryCode: "US",
          workArrangement: "onsite",
          employmentType: "full_time",
          seniority: "junior",
          compensationMin: null,
          compensationMax: null,
          currency: null,
          salaryPeriod: "unknown",
          postedAt: "2026-10-01T00:00:00.000Z",
          listingUrl: "https://boards.greenhouse.io/northwind/jobs/us-easy",
          applicationUrl: null,
          applicationMethod: "easy_apply",
          requisitionId: null,
        },
      ],
    })
    expect(applied).toMatchObject({ ok: true, upserted: 2, expired: 0 })

    const visible = await asUser(ada, () =>
      db.query<{ title: string; total_count: number }>(
        `select title, total_count from public.search_recommended_jobs($1::jsonb) order by title`,
        [JSON.stringify({ countries: ["CA"], sort: "company", limit: 10, offset: 0 })],
      ),
    )
    expect(visible.rows.map((row) => row.title)).toEqual(["Backend Engineer"])

    const easy = await asUser(ada, () =>
      db.query<{ title: string }>(
        `select title from public.search_recommended_jobs($1::jsonb) order by title`,
        [JSON.stringify({ excludeEasyApply: true, includeUnknownCompensation: false, salaryMin: 100000, salaryCurrency: "CAD" })],
      ),
    )
    expect(easy.rows.map((row) => row.title)).toEqual(["Backend Engineer"])

    const page = await asUser(ada, () =>
      db.query<{ title: string; total_count: string }>(
        `select title, total_count from public.search_recommended_jobs($1::jsonb)`,
        [JSON.stringify({ sort: "company", limit: 1, offset: 0 })],
      ),
    )
    expect(page.rows).toHaveLength(1)
    expect(Number(page.rows[0]?.total_count)).toBe(2)

    const failed = await operate("record-source-failure", {
      sourceSlug: "greenhouse:northwind",
      idempotencyKey: "fail-1",
      error: "timeout",
    })
    expect(failed).toMatchObject({ ok: true, activeUnchanged: 2 })
    const stillActive = await db.query("select count(*)::int as count from public.job_postings where listing_status = 'active'")
    expect(stillActive.rows[0]).toMatchObject({ count: 2 })

    const blocked = await operate("apply-catalog", {
      sourceSlug: "greenhouse:northwind",
      idempotencyKey: "empty-1",
      completeSnapshot: true,
      postings: [],
    })
    expect(blocked).toMatchObject({ ok: false, reason: "empty_snapshot_blocked" })
  })

  it("keeps alert deliveries private and idempotent", async () => {
    const subscription = await asUser(ada, async () => {
      const created = await db.query<{ id: string }>(
        `insert into public.job_alert_subscriptions (cadence, timezone, minimum_match)
         values ('daily', 'UTC', 10) returning id`,
      )
      return created.rows[0]?.id
    })
    const posting = await db.query<{ id: string }>(
      "select id from public.job_postings where source_job_id = 'ca-1'",
    )
    const delivery = {
      userId: ada,
      subscriptionId: subscription,
      postingId: posting.rows[0]?.id,
      windowKey: "daily:2026-10-20",
      channel: "in_app",
      status: "recorded",
      error: null,
    }
    await operate("record-alerts", {
      deliveries: [delivery],
      successes: [{ subscriptionId: subscription, ranAt: "2026-10-20T15:00:00.000Z" }],
      failures: [],
    })
    await operate("record-alerts", {
      deliveries: [delivery],
      successes: [{ subscriptionId: subscription, ranAt: "2026-10-20T16:00:00.000Z" }],
      failures: [],
    })
    const own = await asUser(ada, () => db.query("select id from public.job_alert_deliveries"))
    const other = await asUser(grace, () => db.query("select id from public.job_alert_deliveries"))
    expect(own.rows).toHaveLength(1)
    expect(other.rows).toHaveLength(0)
    await expect(
      asUser(grace, () =>
        db.query("insert into public.job_alert_deliveries (user_id, subscription_id, posting_id, window_key, channel, status) values ($1, $2, $3, 'daily:2026-10-21', 'in_app', 'recorded')", [
          grace,
          subscription,
          posting.rows[0]?.id,
        ]),
      ),
    ).rejects.toThrow()
  })
})
