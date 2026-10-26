// @vitest-environment node

import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const migrationsDir = path.join(process.cwd(), "supabase/migrations")

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

function hash(char: string) {
  return char.repeat(64)
}

describe("job analysis database isolation", () => {
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
    await db.query(
      `insert into public.job_sources (
         provider, slug, display_name, access_method, approved_usage, attribution_requirements,
         retention_restrictions, allowed_storage_fields, approval_status, terms_status
       ) values
       ('greenhouse', 'greenhouse:fit-approved', 'Approved', 'documented_https_json', 'use', 'attr', 'keep', '{title}', 'approved', 'permitted'),
       ('greenhouse', 'greenhouse:fit-draft', 'Draft', 'documented_https_json', 'use', 'attr', 'keep', '{title}', 'draft', 'unclear')`,
    )
    const sources = await db.query<{ id: string; slug: string }>("select id, slug from public.job_sources")
    const approved = sources.rows.find((row) => row.slug.endsWith("approved"))?.id
    const draft = sources.rows.find((row) => row.slug.endsWith("draft"))?.id
    await db.query(
      `insert into public.job_postings (source_id, source_job_id, title, listing_url, content_hash, description_text)
       values ($1, 'fit-approved', 'Analyst', 'https://example.com/jobs/fit', $3, $4),
              ($2, 'fit-draft', 'Hidden', 'https://example.com/jobs/hidden', $3, $4)`,
      [approved, draft, hash("a"), "D".repeat(220)],
    )
  }, 30000)

  afterAll(async () => {
    await db?.close()
  })

  async function asUser<T>(userId: string | null, run: () => Promise<T>) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false)`)
    await db.exec("set role authenticated")
    try {
      return await run()
    } finally {
      await db.exec("reset role")
    }
  }

  async function asAnon<T>(run: () => Promise<T>) {
    await db.exec("set role anon")
    try {
      return await run()
    } finally {
      await db.exec("reset role")
    }
  }

  it("hides analyses, blocks another user's application, and reuses the cache key", async () => {
    const applicationId = await asUser(ada, async () => {
      const company = await db.query<{ id: string }>("insert into public.companies (name) values ('Ada Co') returning id")
      const application = await db.query<{ id: string }>(
        "insert into public.applications (company_id, job_title, status) values ($1, 'Analyst', 'saved') returning id",
        [company.rows[0]?.id],
      )
      return application.rows[0]?.id ?? ""
    })
    const posting = await db.query<{ id: string; title: string }>(
      "select id, title from public.job_postings order by title",
    )
    const approvedId = posting.rows.find((row) => row.title === "Analyst")?.id
    const hiddenId = posting.rows.find((row) => row.title === "Hidden")?.id
    const jd = "J".repeat(220)

    const analysisId = await asUser(ada, async () => {
      const inserted = await db.query<{ id: string }>(
        `insert into public.job_analyses (
           posting_id, source, jd_title, jd_company, jd_text, jd_hash, profile_fingerprint,
           prompt_version, schema_version, provider, model, execution_mode, status, score, requirements, matches
         ) values (
           $1, 'posting', 'Analyst', 'Northwind', $2, $3, $4, 'job-fit-test', 'schema-1',
           'openai', 'gpt-5.4-mini', 'byok', 'complete', 50, '[]', '[]'
         ) returning id`,
        [approvedId, jd, hash("b"), hash("c")],
      )
      return inserted.rows[0]?.id
    })

    await expect(
      asUser(ada, () =>
        db.query(
          `insert into public.job_analyses (
             posting_id, source, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version,
             provider, model, execution_mode, status
           ) values ($1, 'posting', $2, $3, $4, 'job-fit-test', 'schema-1', 'openai', 'gpt-5.4-mini', 'byok', 'complete')`,
          [approvedId, jd, hash("b"), hash("c")],
        ),
      ),
    ).rejects.toThrow()

    await expect(
      asUser(ada, () =>
        db.query(
          `insert into public.job_analyses (
             posting_id, source, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version,
             provider, model, execution_mode, status
           ) values ($1, 'posting', $2, $3, $4, 'job-fit-test', 'schema-1', 'openai', 'gpt-5.4-mini', 'byok', 'complete')`,
          [hiddenId, jd, hash("d"), hash("e")],
        ),
      ),
    ).rejects.toThrow()

    await expect(
      asUser(grace, () =>
        db.query(
          `insert into public.job_analyses (
             application_id, source, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version,
             provider, model, execution_mode, status
           ) values ($1, 'application', $2, $3, $4, 'job-fit-test', 'schema-1', 'openai', 'gpt-5.4-mini', 'byok', 'complete')`,
          [applicationId, jd, hash("f"), hash("a")],
        ),
      ),
    ).rejects.toThrow()

    const hidden = await asUser(grace, async () => {
      const rows = await db.query("select id from public.job_analyses")
      await db.query("update public.job_analyses set jd_title = 'stolen'")
      return rows.rows.length
    })
    expect(hidden).toBe(0)
    const still = await asUser(ada, () => db.query<{ jd_title: string }>("select jd_title from public.job_analyses"))
    expect(still.rows[0]?.jd_title).toBe("Analyst")
    expect(analysisId).toBeTruthy()

    await expect(asAnon(() => db.query("select id from public.job_analyses"))).rejects.toThrow()
  })

  async function pastedAnalysis(userId: string, fingerprint: string) {
    return asUser(userId, async () => {
      const inserted = await db.query<{ id: string }>(
        `insert into public.job_analyses (
           source, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version
         ) values ('pasted', $1, $2, $3, 'job-fit-test', 'schema-1') returning id`,
        ["P".repeat(220), hash("9"), hash(fingerprint)],
      )
      return inserted.rows[0]?.id ?? ""
    })
  }

  it("stores a suggested fact for a job analysis without verifying it", async () => {
    const analysisId = await pastedAnalysis(ada, "7")
    const state = await asUser(ada, async () => {
      const profile = await db.query<{ id: string }>(
        "insert into public.career_profiles (summary) values ('Ada') returning id",
      )
      await db.query(
        `insert into public.skill_entries (profile_id, verification_state, name, provenance)
         values ($1, 'suggested', 'TypeScript', $2::jsonb)`,
        [profile.rows[0]?.id, JSON.stringify({ analysisId, requirementId: "req-0" })],
      )
      const row = await db.query<{ verification_state: string; approved_at: string | null }>(
        "select verification_state, approved_at from public.skill_entries",
      )
      return row.rows[0]
    })
    expect(state).toEqual({ verification_state: "suggested", approved_at: null })

    const hidden = await asUser(grace, () => db.query("select id from public.skill_entries"))
    expect(hidden.rows).toEqual([])
  })

  it("rejects provenance that names another user's analysis or no analysis", async () => {
    const adaAnalysis = await pastedAnalysis(ada, "8")
    const graceProfile = await asUser(grace, async () => {
      const profile = await db.query<{ id: string }>(
        "insert into public.career_profiles (summary) values ('Grace') returning id",
      )
      return profile.rows[0]?.id
    })
    for (const analysisId of [adaAnalysis, randomUUID()]) {
      await expect(
        asUser(grace, () =>
          db.query(
            `insert into public.skill_entries (profile_id, verification_state, name, provenance)
             values ($1, 'suggested', 'Stolen', $2::jsonb)`,
            [graceProfile, JSON.stringify({ analysisId, requirementId: "req-0" })],
          ),
        ),
      ).rejects.toThrow(/analysis not owned/)
    }
  })

  it("keeps analyses when a linked application, resume source, or posting is deleted", async () => {
    const ids = await asUser(ada, async () => {
      const company = await db.query<{ id: string }>("insert into public.companies (name) values ('Delete Co') returning id")
      const apps = await db.query<{ id: string }>(
        "insert into public.applications (company_id, job_title, status) values ($1, 'One', 'saved'), ($1, 'Two', 'saved') returning id",
        [company.rows[0]?.id],
      )
      const profile = await db.query<{ id: string }>("select id from public.career_profiles limit 1")
      const source = await db.query<{ id: string }>(
        "insert into public.career_sources (profile_id, label, body, sha256) values ($1, 'Resume', 'Resume body', $2) returning id",
        [profile.rows[0]?.id, hash("5")],
      )
      return {
        apps: apps.rows.map((row) => row.id),
        source: source.rows[0]?.id ?? "",
      }
    })
    const sourceRow = await db.query<{ id: string }>("select id from public.job_sources where slug = 'greenhouse:fit-approved'")
    const posting = await db.query<{ id: string }>(
      `insert into public.job_postings (source_id, source_job_id, title, listing_url, content_hash, description_text)
       values ($1, 'fit-delete', 'Delete me', 'https://example.com/jobs/delete', $2, $3) returning id`,
      [sourceRow.rows[0]?.id, hash("a"), "D".repeat(220)],
    )
    const postingId = posting.rows[0]?.id
    const jd = "K".repeat(220)
    await asUser(ada, async () => {
      for (const [index, appId] of ids.apps.entries()) {
        await db.query(
          `insert into public.job_analyses (
             application_id, resume_source_id, source, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version
           ) values ($1, $2, 'application', $3, $4, $5, 'job-fit-test', 'schema-1')`,
          [appId, ids.source, jd, hash("6"), hash(String(index))],
        )
      }
      await db.query(
        `insert into public.job_analyses (
           posting_id, resume_source_id, source, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version
         ) values ($1, $2, 'posting', $3, $4, $5, 'job-fit-test', 'schema-1')`,
        [postingId, ids.source, jd, hash("6"), hash("4")],
      )
    })

    await asUser(ada, async () => {
      await db.query("delete from public.applications where id = any($1::uuid[])", [ids.apps])
      await db.query("delete from public.career_sources where id = $1", [ids.source])
    })
    // A catalog delete runs without a user session.
    await db.exec("select set_config('request.jwt.claim.sub', '', false)")
    await db.query("delete from public.job_postings where id = $1", [postingId])

    const rows = await asUser(ada, () =>
      db.query<{ application_id: string | null; resume_source_id: string | null; posting_id: string | null; jd_text: string }>(
        "select application_id, resume_source_id, posting_id, jd_text from public.job_analyses where jd_text = $1",
        [jd],
      ),
    )
    expect(rows.rows).toHaveLength(3)
    for (const row of rows.rows) {
      expect(row).toEqual({ application_id: null, resume_source_id: null, posting_id: null, jd_text: jd })
    }

    // Without a session, only clearing a link is allowed.
    await db.exec("select set_config('request.jwt.claim.sub', '', false)")
    await expect(db.query("update public.job_analyses set jd_title = 'changed' where jd_text = $1", [jd])).rejects.toThrow(
      /not authenticated/,
    )
  })

  it("lets the owner update an analysis after its posting's source is revoked", async () => {
    const sourceRow = await db.query<{ id: string }>(
      `insert into public.job_sources (
         provider, slug, display_name, access_method, approved_usage, attribution_requirements,
         retention_restrictions, allowed_storage_fields, approval_status, terms_status
       ) values ('greenhouse', 'greenhouse:fit-revoke', 'Revoke', 'documented_https_json', 'use', 'attr', 'keep', '{title}', 'approved', 'permitted')
       returning id`,
    )
    const posting = await db.query<{ id: string }>(
      `insert into public.job_postings (source_id, source_job_id, title, listing_url, content_hash, description_text)
       values ($1, 'fit-revoke', 'Revoked', 'https://example.com/jobs/revoked', $2, $3) returning id`,
      [sourceRow.rows[0]?.id, hash("a"), "D".repeat(220)],
    )
    const analysisId = await asUser(ada, async () => {
      const inserted = await db.query<{ id: string }>(
        `insert into public.job_analyses (
           posting_id, source, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version
         ) values ($1, 'posting', $2, $3, $4, 'job-fit-test', 'schema-1') returning id`,
        [posting.rows[0]?.id, "R".repeat(220), hash("3"), hash("3")],
      )
      return inserted.rows[0]?.id
    })
    await db.query("update public.job_sources set approval_status = 'revoked' where id = $1", [sourceRow.rows[0]?.id])
    const updated = await asUser(ada, () =>
      db.query("update public.job_analyses set status = 'failed', error_code = 'transient' where id = $1", [analysisId]),
    )
    expect(updated.affectedRows).toBe(1)
  })
})
