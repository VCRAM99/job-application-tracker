// @vitest-environment node

import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { jobOperationProof, type JobOperation } from "@/lib/jobs/proof"
import { scorePosting } from "@/lib/jobs/score"
import { normalizeJobUrl } from "@/lib/jobs/text"

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
    const stamped =
      (operation === "register-source" || operation === "approve-source") && payload && typeof payload === "object" && !("now" in payload)
        ? { ...(payload as Record<string, unknown>), now: new Date().toISOString() }
        : payload
    const text = JSON.stringify(stamped)
    const proof = jobOperationProof(SECRET, operation, text)
    const functions: Record<JobOperation, string> = {
      "apply-catalog": "apply_job_catalog",
      "register-source": "register_job_source",
      "approve-source": "approve_job_source",
      "record-source-failure": "record_job_source_failure",
      "record-alerts": "record_job_alerts",
      "collect-alerts": "collect_alert_workspace",
      "list-ingestion-sources": "list_job_ingestion_sources",
      "source-status": "job_source_status",
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
      liveIngestionEnabled: true,
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

  it("refreshes the same source again and reactivates a posting that returns", async () => {
    const activation = {
      accessMethod: "documented_https_json",
      approvedUsage: "Store normalized public posting fields for signed-in recommendations.",
      attributionRequirements: "Name Greenhouse and link the original posting.",
      retentionRestrictions: "Expire listings omitted from a successful full refresh.",
      allowedStorageFields: ["title", "location", "urls"],
    }
    await operate("register-source", {
      provider: "greenhouse",
      slug: "greenhouse:repeat",
      displayName: "Repeat",
      sourceIdentifier: "repeat",
      employerName: "Repeat",
      employerDomain: "repeat.example",
      ...activation,
    })
    await operate("approve-source", {
      slug: "greenhouse:repeat",
      approvalStatus: "approved",
      termsStatus: "permitted",
      liveIngestionEnabled: true,
      refreshLimitPerDay: 24,
      ...activation,
    })
    const posting = (id: string, title: string) => ({
      sourceJobId: id,
      employerName: "Repeat",
      employerDomain: "repeat.example",
      title,
      listingUrl: `https://boards.greenhouse.io/repeat/jobs/${id}`,
      contentHash: hash(),
      listingStatus: "active",
    })
    const apply = (key: string, postings: unknown[]) =>
      operate("apply-catalog", { sourceSlug: "greenhouse:repeat", idempotencyKey: key, completeSnapshot: true, postings })
    const status = async () =>
      (
        await db.query<{ source_job_id: string; title: string; listing_status: string }>(
          `select p.source_job_id, p.title, p.listing_status from public.job_postings p
           join public.job_sources s on s.id = p.source_id where s.slug = 'greenhouse:repeat' order by 1`,
        )
      ).rows

    expect(await apply("repeat-1", [posting("a", "Engineer"), posting("b", "Designer")])).toMatchObject({
      ok: true,
      upserted: 2,
      inserted: 2,
      expired: 0,
    })
    expect(await apply("repeat-2", [posting("a", "Senior Engineer"), posting("a", "Senior Engineer")])).toMatchObject({
      ok: true,
      upserted: 1,
      inserted: 0,
      expired: 1,
    })
    expect(await status()).toEqual([
      { source_job_id: "a", title: "Senior Engineer", listing_status: "active" },
      { source_job_id: "b", title: "Designer", listing_status: "expired" },
    ])
    expect(await apply("repeat-3", [posting("a", "Senior Engineer"), posting("b", "Designer")])).toMatchObject({
      ok: true,
      inserted: 0,
      expired: 0,
    })
    expect((await status()).map((row) => row.listing_status)).toEqual(["active", "active"])
  })

  it("refuses catalog writes for a source that is not approved, permitted, and live", async () => {
    const activation = {
      accessMethod: "documented_https_json",
      approvedUsage: "Store normalized public posting fields.",
      attributionRequirements: "Name Greenhouse.",
      retentionRestrictions: "Expire omitted listings.",
      allowedStorageFields: ["title"],
    }
    await operate("register-source", { provider: "greenhouse", slug: "greenhouse:paused", displayName: "Paused", sourceIdentifier: "paused", ...activation })
    const runs = async () =>
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from public.job_source_runs r join public.job_sources s on s.id = r.source_id where s.slug = 'greenhouse:paused'",
        )
      ).rows[0]?.count
    const tryWrites = async () => ({
      apply: await operate("apply-catalog", {
        sourceSlug: "greenhouse:paused",
        idempotencyKey: `paused-${Math.random()}`,
        completeSnapshot: true,
        postings: [{ sourceJobId: "p1", title: "Role", listingUrl: "https://boards.greenhouse.io/paused/jobs/p1", contentHash: hash() }],
      }),
      failure: await operate("record-source-failure", { sourceSlug: "greenhouse:paused", idempotencyKey: `paused-${Math.random()}`, error: "timeout" }),
    })
    const notLive = { apply: { ok: false, reason: "source_not_live" }, failure: { ok: false, reason: "source_not_live" } }

    expect(await tryWrites()).toEqual(notLive)
    await operate("approve-source", { slug: "greenhouse:paused", approvalStatus: "approved", termsStatus: "permitted", liveIngestionEnabled: false, refreshLimitPerDay: 4, ...activation })
    expect(await tryWrites()).toEqual(notLive)
    await operate("approve-source", { slug: "greenhouse:paused", approvalStatus: "approved", termsStatus: "restricted", liveIngestionEnabled: false, refreshLimitPerDay: 4, ...activation })
    expect(await tryWrites()).toEqual(notLive)
    expect(await runs()).toBe(0)
    const postings = await db.query<{ count: number }>(
      "select count(*)::int as count from public.job_postings p join public.job_sources s on s.id = p.source_id where s.slug = 'greenhouse:paused'",
    )
    expect(postings.rows[0]?.count).toBe(0)
    await operate("approve-source", { slug: "greenhouse:paused", approvalStatus: "revoked", termsStatus: "unclear", liveIngestionEnabled: false, refreshLimitPerDay: 0, ...activation })
  })

  it("rejects source registration and approval without a fresh now", async () => {
    const signed = (operation: "register-source" | "approve-source", payload: Record<string, unknown>) => {
      const text = JSON.stringify(payload)
      const fn = operation === "register-source" ? "register_job_source" : "approve_job_source"
      return db.query(`select public.${fn}($1, $2)`, [text, jobOperationProof(SECRET, operation, text)])
    }
    const register = {
      provider: "greenhouse",
      slug: "greenhouse:stale",
      displayName: "Stale",
      sourceIdentifier: "stale",
      accessMethod: "documented_https_json",
      approvedUsage: "x",
      attributionRequirements: "x",
      retentionRestrictions: "x",
      allowedStorageFields: ["title"],
    }
    const approve = { ...register, slug: "greenhouse:northwind", approvalStatus: "revoked", termsStatus: "unclear", liveIngestionEnabled: false, refreshLimitPerDay: 0 }
    const stamps = {
      stale: new Date(Date.now() - 6 * 60_000).toISOString(),
      future: new Date(Date.now() + 6 * 60_000).toISOString(),
      garbage: "yesterday",
    }
    for (const operation of ["register-source", "approve-source"] as const) {
      const body = operation === "register-source" ? register : approve
      await expect(signed(operation, body)).rejects.toThrow(/stale request/)
      for (const now of Object.values(stamps)) {
        await expect(signed(operation, { ...body, now })).rejects.toThrow(/stale request/)
      }
    }
    const rows = await db.query<{ slug: string; approval_status: string }>(
      "select slug, approval_status from public.job_sources where slug in ('greenhouse:stale', 'greenhouse:northwind')",
    )
    expect(rows.rows).toEqual([{ slug: "greenhouse:northwind", approval_status: "approved" }])
    const fresh = await signed("register-source", { ...register, slug: "greenhouse:northwind", now: new Date().toISOString() })
    expect(fresh.rows[0]).toMatchObject({ register_job_source: { ok: true, created: false } })
  })

  it("applies a chunked snapshot and expires only absent postings, once, on the final chunk", async () => {
    const activation = {
      accessMethod: "documented_https_json",
      approvedUsage: "Store normalized public posting fields.",
      attributionRequirements: "Name Greenhouse.",
      retentionRestrictions: "Expire omitted listings.",
      allowedStorageFields: ["title"],
    }
    await operate("register-source", { provider: "greenhouse", slug: "greenhouse:chunks", displayName: "Chunks", sourceIdentifier: "chunks", ...activation })
    await operate("approve-source", { slug: "greenhouse:chunks", approvalStatus: "approved", termsStatus: "permitted", liveIngestionEnabled: true, refreshLimitPerDay: 1, ...activation })
    const posting = (id: string) => ({
      sourceJobId: id,
      title: `Role ${id}`,
      listingUrl: `https://boards.greenhouse.io/chunks/jobs/${id}`,
      contentHash: hash(),
      listingStatus: "active",
    })
    const chunk = (snapshot: string, index: number, final: boolean, ids: string[], extra: Record<string, unknown> = {}) =>
      operate("apply-catalog", {
        sourceSlug: "greenhouse:chunks",
        idempotencyKey: `${snapshot}:c${index}`,
        snapshotKey: snapshot,
        chunkIndex: index,
        finalChunk: final,
        completeSnapshot: true,
        allowEmpty: false,
        postings: ids.map(posting),
        ...extra,
      })
    const statuses = async () =>
      Object.fromEntries(
        (
          await db.query<{ source_job_id: string; listing_status: string }>(
            `select p.source_job_id, p.listing_status from public.job_postings p
             join public.job_sources s on s.id = p.source_id where s.slug = 'greenhouse:chunks'`,
          )
        ).rows.map((row) => [row.source_job_id, row.listing_status]),
      )

    // Day 1, one chunk. Refresh limit is 1 per day.
    expect(await chunk("snap-1", 0, true, ["a", "b", "c", "d"])).toMatchObject({ ok: true, inserted: 4, expired: 0 })
    // Allow a second snapshot today, then move day 1's run outside the 24 hour window.
    await db.exec("update public.job_source_runs set started_at = started_at - interval '2 days' where idempotency_key = 'apply-catalog:snap-1:c0'")
    await db.exec("update public.job_postings set last_verified_at = last_verified_at - interval '2 days' where source_job_id in ('a','b','c','d')")

    // Day 2: d is gone. Three chunks; earlier chunks never expire.
    expect(await chunk("snap-2", 0, false, ["a"])).toMatchObject({ ok: true, upserted: 1, expired: 0 })
    expect(await chunk("snap-2", 1, false, ["b"])).toMatchObject({ ok: true, upserted: 1, expired: 0 })
    expect(await statuses()).toEqual({ a: "active", b: "active", c: "active", d: "active" })
    expect(await chunk("snap-2", 2, true, ["c", "e"])).toMatchObject({ ok: true, upserted: 2, inserted: 1, expired: 1 })
    expect(await statuses()).toEqual({ a: "active", b: "active", c: "active", d: "expired", e: "active" })
    expect(await chunk("snap-2", 2, true, ["c", "e"])).toMatchObject({ ok: true, reason: "duplicate" })

    // Chunks 1+ do not count toward the daily limit, so only chunk 0 of a new snapshot is limited.
    expect(await chunk("snap-3", 0, false, ["a"])).toMatchObject({ ok: false, reason: "rate_limited" })
  })

  it("expires nothing when a middle chunk is missing and rejects malformed chunk metadata", async () => {
    await db.exec("update public.job_source_runs set started_at = started_at - interval '2 days' where idempotency_key like 'apply-catalog:snap-%'")
    const posting = (id: string) => ({ sourceJobId: id, title: id, listingUrl: `https://boards.greenhouse.io/chunks/jobs/${id}`, contentHash: hash(), listingStatus: "active" })
    const send = (body: Record<string, unknown>) => operate("apply-catalog", { sourceSlug: "greenhouse:chunks", completeSnapshot: true, ...body })
    const before = await db.query("select count(*)::int as count from public.job_postings where listing_status = 'expired'")

    expect(await send({ idempotencyKey: "snap-4:c0", snapshotKey: "snap-4", chunkIndex: 0, finalChunk: false, postings: [posting("a")] })).toMatchObject({ ok: true, expired: 0 })
    // Chunk 1 failed and was never applied; the final chunk 2 is refused and expires nothing.
    expect(await send({ idempotencyKey: "snap-4:c2", snapshotKey: "snap-4", chunkIndex: 2, finalChunk: true, postings: [posting("b")] })).toEqual({
      ok: false,
      reason: "chunk_out_of_order",
    })
    const after = await db.query("select count(*)::int as count from public.job_postings where listing_status = 'expired'")
    expect(after.rows).toEqual(before.rows)

    await expect(send({ idempotencyKey: "other:c1", snapshotKey: "snap-4", chunkIndex: 1, finalChunk: true, postings: [] })).rejects.toThrow(/invalid catalog batch/)
    await expect(send({ idempotencyKey: "snap-4:c1", chunkIndex: 1, finalChunk: true, postings: [] })).rejects.toThrow(/invalid catalog batch/)
    await expect(send({ idempotencyKey: "snap-4:cx", snapshotKey: "snap-4", chunkIndex: "x", postings: [] })).rejects.toThrow(/invalid catalog batch/)
    const locks = await db.query("select count(*)::int as count from public.job_processing_locks where name = 'catalog:greenhouse:chunks'")
    expect(locks.rows[0]).toEqual({ count: 0 })
    await operate("approve-source", {
      slug: "greenhouse:chunks", approvalStatus: "revoked", termsStatus: "unclear", liveIngestionEnabled: false, refreshLimitPerDay: 0,
      accessMethod: "documented_https_json", approvedUsage: "x", attributionRequirements: "x", retentionRestrictions: "x", allowedStorageFields: ["title"],
    })
  })

  it("lists approved sources for the runner only with a fresh signed request", async () => {
    const list = (payload: string, proof: string) =>
      asUser(null, () =>
        db.query<{ result: { ok: boolean; sources: Array<{ slug: string; liveIngestionEnabled: boolean }> } }>(
          "select public.list_job_ingestion_sources($1, $2) as result",
          [payload, proof],
        ),
      )
    const fresh = JSON.stringify({ now: new Date().toISOString() })
    const listed = await list(fresh, jobOperationProof(SECRET, "list-ingestion-sources", fresh))
    const slugs = listed.rows[0]?.result.sources.map((source) => source.slug) ?? []
    expect(slugs).toContain("greenhouse:repeat")
    expect(slugs.some((slug) => slug.startsWith("provider:"))).toBe(false)

    const stale = JSON.stringify({ now: new Date(Date.now() - 10 * 60_000).toISOString() })
    await expect(list(stale, jobOperationProof(SECRET, "list-ingestion-sources", stale))).rejects.toThrow(/stale request/)
    await expect(list(fresh, jobOperationProof(SECRET, "collect-alerts", fresh))).rejects.toThrow(/not authorized/)
    await expect(list("not json", jobOperationProof(SECRET, "list-ingestion-sources", "not json"))).rejects.toThrow()

    await operate("approve-source", {
      slug: "greenhouse:repeat",
      approvalStatus: "revoked",
      termsStatus: "permitted",
      liveIngestionEnabled: false,
      refreshLimitPerDay: 0,
      accessMethod: "documented_https_json",
      approvedUsage: "Revoked.",
      attributionRequirements: "Revoked.",
      retentionRestrictions: "Revoked.",
      allowedStorageFields: ["title"],
    })
    const again = JSON.stringify({ now: new Date().toISOString() })
    const after = await list(again, jobOperationProof(SECRET, "list-ingestion-sources", again))
    expect(after.rows[0]?.result.sources.map((source) => source.slug)).not.toContain("greenhouse:repeat")
  })

  it("returns source run status only to a fresh signed request, with run metadata and nothing else", async () => {
    const status = (payload: string, proof: string) =>
      asUser(null, () =>
        db.query<{ result: { ok: boolean; sources: Array<Record<string, unknown> & { slug: string; runs: Array<Record<string, unknown>> }> } }>(
          "select public.job_source_status($1, $2) as result",
          [payload, proof],
        ),
      )
    const fresh = JSON.stringify({ now: new Date().toISOString(), runs: 3 })
    const result = (await status(fresh, jobOperationProof(SECRET, "source-status", fresh))).rows[0]?.result
    expect(result?.ok).toBe(true)
    const repeat = result?.sources.find((source) => source.slug === "greenhouse:repeat")
    expect(repeat).toBeTruthy()
    expect(Object.keys(repeat!).sort()).toEqual(["approvalStatus", "liveIngestionEnabled", "refreshLimitPerDay", "runs", "slug"])
    expect(repeat!.runs.length).toBeGreaterThan(0)
    expect(repeat!.runs.length).toBeLessThanOrEqual(3)
    for (const run of repeat!.runs) expect(Object.keys(run).sort()).toEqual(["error", "fetchedCount", "finishedAt", "startedAt", "status"])

    const stale = JSON.stringify({ now: new Date(Date.now() - 10 * 60_000).toISOString() })
    await expect(status(stale, jobOperationProof(SECRET, "source-status", stale))).rejects.toThrow(/stale request/)
    // Another operation's proof, or no valid proof, is refused.
    await expect(status(fresh, jobOperationProof(SECRET, "list-ingestion-sources", fresh))).rejects.toThrow(/not authorized/)
    await expect(status(fresh, "0".repeat(64))).rejects.toThrow(/not authorized/)
    // A signed-in user without the secret gets nothing either.
    await expect(asUser(ada, () => db.query("select public.job_source_status($1, $2)", [fresh, "f".repeat(64)]))).rejects.toThrow(/not authorized/)
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

  it("finds a duplicate application for the owner only and rejects a concurrent copy", async () => {
    const normalized = await db.query<{ normalize_job_url: string }>(
      "select public.normalize_job_url('https://Jobs.Example/roles/1/#apply') as normalize_job_url",
    )
    expect(normalized.rows[0]?.normalize_job_url).toBe(normalizeJobUrl("https://Jobs.Example/roles/1/#apply"))

    const company = await asUser(ada, () =>
      db.query<{ id: string }>("insert into public.companies (name) values ('Northwind') returning id"),
    )
    await asUser(ada, () =>
      db.query(
        `insert into public.applications (company_id, job_title, job_url, status)
         values ($1, 'Backend Engineer', 'https://jobs.example/roles/1/', 'saved')`,
        [company.rows[0]?.id],
      ),
    )
    const own = await asUser(ada, () =>
      db.query<{ find_application_duplicate: string }>(
        "select public.find_application_duplicate(' backend engineer ', 'https://jobs.example/roles/1')",
      ),
    )
    const other = await asUser(grace, () =>
      db.query<{ find_application_duplicate: string | null }>(
        "select public.find_application_duplicate('Backend Engineer', 'https://jobs.example/roles/1')",
      ),
    )
    expect(own.rows[0]?.find_application_duplicate).toBeTruthy()
    expect(other.rows[0]?.find_application_duplicate).toBeNull()
    await expect(
      asUser(ada, () =>
        db.query(
          `insert into public.applications (company_id, job_title, job_url, status)
           values ($1, 'Backend Engineer', 'https://jobs.example/roles/1', 'saved')`,
          [company.rows[0]?.id],
        ),
      ),
    ).rejects.toThrow(/duplicate key|applications_user_match_key_idx/)
    const graceCompany = await asUser(grace, () =>
      db.query<{ id: string }>("insert into public.companies (name) values ('Northwind') returning id"),
    )
    await asUser(grace, () =>
      db.query(
        `insert into public.applications (company_id, job_title, job_url, status)
         values ($1, 'Backend Engineer', 'https://jobs.example/roles/1', 'saved')`,
        [graceCompany.rows[0]?.id],
      ),
    )
    const imported = await asUser(ada, () =>
      db.query<{ import_applications: { applications_inserted: number; applications_skipped: number } }>(
        `select public.import_applications($1::jsonb) as import_applications`,
        [JSON.stringify([{ company_name: "Northwind", job_title: "Backend Engineer", job_url: "https://JOBS.example/roles/1#frag" }])],
      ),
    )
    expect(imported.rows[0]?.import_applications.applications_inserted).toBe(0)
    expect(imported.rows[0]?.import_applications.applications_skipped).toBe(1)

    const blank = await asUser(ada, () =>
      db.query(
        `insert into public.applications (company_id, job_title, status)
         values ($1, 'Untitled role', 'saved'), ($1, 'Untitled role', 'saved')`,
        [company.rows[0]?.id],
      ),
    )
    expect(blank.rowCount).toBe(2)
    const visible = await asUser(ada, () => db.query<{ slug: string }>("select slug from public.job_sources order by slug"))
    expect(visible.rows.map((row) => row.slug)).toEqual(["greenhouse:northwind"])
    await db.exec("alter table public.applications disable trigger applications_set_match_key")
    const historical = await asUser(ada, () =>
      db.query<{ id: string }>(
        `insert into public.applications (company_id, job_title, job_url, status)
         values ($1, 'Duplicate Analyst', 'https://jobs.example/roles/historical', 'saved')
         returning id`,
        [company.rows[0]?.id],
      ),
    )
    const later = await asUser(ada, () =>
      db.query<{ id: string }>(
        `insert into public.applications (company_id, job_title, job_url, status)
         values ($1, 'Duplicate Analyst', 'https://jobs.example/roles/historical/', 'saved')
         returning id`,
        [company.rows[0]?.id],
      ),
    )
    await db.exec(`select set_config('request.jwt.claim.sub', '${ada}', false)`)
    await db.query(
      `update public.applications
       set job_match_key = public.application_match_key(job_title, job_url)
       where id = $1`,
      [historical.rows[0]?.id],
    )
    await db.query("update public.applications set job_match_key = null where id = $1", [later.rows[0]?.id])
    await db.exec("select set_config('request.jwt.claim.sub', '', false)")
    await db.exec("alter table public.applications enable trigger applications_set_match_key")
    await asUser(ada, () =>
      db.query("update public.applications set status = 'applied' where id = $1", [later.rows[0]?.id]),
    )
    const preserved = await db.query<{ status: string; job_match_key: string | null }>(
      "select status, job_match_key from public.applications where id = $1",
      [later.rows[0]?.id],
    )
    expect(preserved.rows[0]).toEqual({ status: "applied", job_match_key: null })
    expect(historical.rows[0]?.id).toBeTruthy()
    await expect(
      asUser(ada, () =>
        db.query(
          `insert into public.applications (company_id, job_title, job_url, status)
           values ($1, 'Duplicate Analyst', 'https://jobs.example/roles/historical', 'saved')`,
          [company.rows[0]?.id],
        ),
      ),
    ).rejects.toThrow(/duplicate key|applications_user_match_key_idx/)

    const drafts = await db.query<{ slug: string }>(
      "select slug from public.job_sources where approval_status = 'draft' order by slug",
    )
    expect(drafts.rows.map((row) => row.slug)).toEqual(["provider:ashby", "provider:greenhouse", "provider:lever"])
  })
})
