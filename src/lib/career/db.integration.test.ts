// @vitest-environment node

import { createHash, randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
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

describe("career database isolation", () => {
  let db: PGlite
  const ada = randomUUID()
  const grace = randomUUID()

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(bootstrap)
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
    for (const file of files) {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"))
    }
    await db.query("insert into auth.users (id) values ($1), ($2)", [ada, grace])
  }, 30000)

  afterAll(async () => {
    await db?.close()
  })

  async function asUser<T>(userId: string, run: () => Promise<T>) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false)`)
    await db.exec("set role authenticated")
    try {
      return await run()
    } finally {
      await db.exec("reset role")
    }
  }

  it("hides one user's profile, source, and credential from another user", async () => {
    await asUser(ada, async () => {
      await db.query(
        `insert into public.career_profiles (summary, target_roles, countries, work_arrangements)
         values ('Ada profile', '{Engineer}', '{CA}', '{remote}')`,
      )
      const profile = await db.query<{ id: string }>("select id from public.career_profiles")
      const body = "Ada resume text"
      await db.query(
        `insert into public.career_sources (profile_id, label, body, sha256)
         values ($1, 'Resume A', $2, $3)`,
        [profile.rows[0]?.id, body, createHash("sha256").update(body).digest("hex")],
      )
      await db.query(
        `select public.rotate_ai_credential('openai', '1', 'abcd', $1, $2, $3)`,
        ["ciphertext-value", "nonce-value-xx", "auth-tag-value"],
      )
    })

    const hidden = await asUser(grace, async () => {
      const profiles = await db.query("select id from public.career_profiles")
      const sources = await db.query("select body from public.career_sources")
      const summaries = await db.query("select provider from public.ai_credential_summaries")
      return {
        profiles: profiles.rows.length,
        sources: sources.rows.length,
        summaries: summaries.rows.length,
      }
    })

    expect(hidden).toEqual({ profiles: 0, sources: 0, summaries: 0 })
  })

  it("rejects a verified fact that points at another user's source", async () => {
    const owned = await asUser(ada, async () => {
      const result = await db.query<{ profile_id: string; id: string }>(
        "select profile_id, id from public.career_sources",
      )
      return result.rows[0]
    })

    await expect(
      asUser(grace, () =>
        db.query(
          `insert into public.employment_entries (
             profile_id, verification_state, source_id, approved_at, organization, title
           ) values ($1, 'user_verified', $2, now(), 'Stolen', 'Role')`,
          [owned?.profile_id, owned?.id],
        ),
      ),
    ).rejects.toThrow()
  })

  it("blocks direct suggestion acceptance and immutable verified edits", async () => {
    const suggestionId = await asUser(ada, async () => {
      const source = await db.query<{ id: string }>("select id from public.career_sources")
      const reserved = await db.query<{ reserve_ai_usage: { id: string } }>(
        `select public.reserve_ai_usage($1, 'byok', 'openai', 'gpt-5.4-mini') as reserve_ai_usage`,
        ["idem-accept-0001"],
      )
      const usageId = reserved.rows[0]?.reserve_ai_usage.id
      const dedupe = createHash("sha256").update("ada-job").digest("hex")
      const inserted = await db.query<{ insert_career_suggestions: { ids: string[] } }>(
        `select public.insert_career_suggestions($1, $2, $3::jsonb) as insert_career_suggestions`,
        [
          usageId,
          source.rows[0]?.id,
          JSON.stringify([
            {
              fact_type: "employment",
              dedupe_key: dedupe,
              evidence_excerpt: "Engineer at Example",
              payload: {
                organization: "Example",
                title: "Engineer",
                current: false,
                evidence: "Engineer at Example",
              },
            },
          ]),
        ],
      )
      return inserted.rows[0]?.insert_career_suggestions.ids[0]
    })

    await expect(
      asUser(ada, () =>
        db.query(
          `update public.ai_suggestions
             set status = 'accepted', resulting_fact_id = gen_random_uuid(), resolved_at = now()
           where id = $1`,
          [suggestionId],
        ),
      ),
    ).rejects.toThrow(/accepted through review|42501/)

    const factId = await asUser(ada, async () => {
      const accepted = await db.query<{ accept_career_suggestion: string }>(
        `select public.accept_career_suggestion($1, $2::jsonb) as accept_career_suggestion`,
        [
          suggestionId,
          JSON.stringify({
            organization: "Example",
            title: "Engineer",
            current: false,
            evidence: "Engineer at Example",
          }),
        ],
      )
      return accepted.rows[0]?.accept_career_suggestion
    })

    const again = await asUser(ada, async () => {
      const accepted = await db.query<{ accept_career_suggestion: string }>(
        `select public.accept_career_suggestion($1, '{}'::jsonb) as accept_career_suggestion`,
        [suggestionId],
      )
      return accepted.rows[0]?.accept_career_suggestion
    })
    expect(again).toBe(factId)

    await expect(
      asUser(ada, () =>
        db.query("update public.employment_entries set title = 'Changed' where id = $1", [factId]),
      ),
    ).rejects.toThrow(/immutable/)

    await expect(
      asUser(grace, () =>
        db.query(`select public.accept_career_suggestion($1, '{}'::jsonb)`, [suggestionId]),
      ),
    ).rejects.toThrow(/not found/)

    const facts = await asUser(grace, async () => {
      const result = await db.query("select id from public.employment_entries")
      return result.rows.length
    })
    expect(facts).toBe(0)
  })

  it("keeps rejected suggestions rejected and preserves a superseded fact", async () => {
    const { suggestionId, factId } = await asUser(ada, async () => {
      const source = await db.query<{ id: string }>("select id from public.career_sources")
      const reserved = await db.query<{ reserve_ai_usage: { id: string } }>(
        `select public.reserve_ai_usage($1, 'byok', 'anthropic', 'claude-haiku-4-5') as reserve_ai_usage`,
        ["idem-reject-0001"],
      )
      const dedupe = createHash("sha256").update("ada-skill").digest("hex")
      const inserted = await db.query<{ insert_career_suggestions: { ids: string[] } }>(
        `select public.insert_career_suggestions($1, $2, $3::jsonb) as insert_career_suggestions`,
        [
          reserved.rows[0]?.reserve_ai_usage.id,
          source.rows[0]?.id,
          JSON.stringify([
            {
              fact_type: "skill",
              dedupe_key: dedupe,
              evidence_excerpt: "TypeScript",
              payload: { name: "TypeScript", evidence: "TypeScript" },
            },
          ]),
        ],
      )
      const id = inserted.rows[0]?.insert_career_suggestions.ids[0]
      await db.query("select public.reject_career_suggestion($1)", [id])
      await db.query("select public.reject_career_suggestion($1)", [id])
      const employment = await db.query<{ id: string }>(
        "select id from public.employment_entries where verification_state = 'user_verified'",
      )
      await db.query("select public.supersede_career_fact('employment_entries', $1)", [
        employment.rows[0]?.id,
      ])
      return { suggestionId: id, factId: employment.rows[0]?.id }
    })

    const states = await asUser(ada, async () => {
      const suggestion = await db.query<{ status: string }>(
        "select status from public.ai_suggestions where id = $1",
        [suggestionId],
      )
      const fact = await db.query<{ verification_state: string }>(
        "select verification_state from public.employment_entries where id = $1",
        [factId],
      )
      return {
        suggestion: suggestion.rows[0]?.status,
        fact: fact.rows[0]?.verification_state,
      }
    })
    expect(states).toEqual({ suggestion: "rejected", fact: "superseded" })

    await expect(
      asUser(ada, () =>
        db.query(
          `update public.ai_suggestions set status = 'accepted', resulting_fact_id = gen_random_uuid(), resolved_at = now() where id = $1`,
          [suggestionId],
        ),
      ),
    ).rejects.toThrow(/immutable/)
  })

  it("does not return ciphertext through the summary and blocks forged verification", async () => {
    await expect(
      asUser(ada, () => db.query("select ciphertext from public.ai_credentials")),
    ).rejects.toThrow(/permission denied/)

    const summary = await asUser(ada, async () => {
      const result = await db.query<{ status: string; last_four: string }>(
        "select status, last_four from public.ai_credential_summaries",
      )
      return result.rows[0]
    })
    expect(summary).toMatchObject({ status: "unverified", last_four: "abcd" })

    await expect(
      asUser(ada, () =>
        db.query("update public.ai_credentials set status = 'verified' where status = 'unverified'"),
      ),
    ).rejects.toThrow(/permission denied/)

    await expect(
      db.query("update public.ai_credentials set status = 'verified' where status = 'unverified'"),
    ).rejects.toThrow(/not enabled/)

    const material = await asUser(ada, async () => {
      const id = await db.query<{ id: string }>(
        "select id from public.ai_credential_summaries where status = 'unverified'",
      )
      const secret = await db.query<{ ciphertext: string }>(
        "select ciphertext from public.read_own_credential_material($1)",
        [id.rows[0]?.id],
      )
      return secret.rows[0]?.ciphertext
    })
    expect(material).toBe("ciphertext-value")

    const stolen = await asUser(grace, () =>
      db.query("select ciphertext from public.read_own_credential_material($1)", [randomUUID()]),
    )
    expect(stolen.rows).toHaveLength(0)
  })

  it("enforces managed quota, idempotency, and expired reservations", async () => {
    await db.exec("reset role")
    await db.query(
      `update public.ai_platform_policy
         set managed_enabled = true, monthly_request_limit = 1, monthly_token_limit = 100
       where id = 1`,
    )

    await expect(
      asUser(grace, () =>
        db.query(`select public.reserve_ai_usage('grace-managed-1', 'managed', 'google', 'gemini-2.5-flash')`),
      ),
    ).resolves.toBeTruthy()

    await expect(
      asUser(grace, () =>
        db.query(`select public.reserve_ai_usage('grace-managed-2', 'managed', 'google', 'gemini-2.5-flash')`),
      ),
    ).rejects.toThrow(/quota exceeded/)

    const reused = await asUser(grace, async () => {
      const result = await db.query<{ reserve_ai_usage: { reused: boolean; status: string } }>(
        `select public.reserve_ai_usage('grace-managed-1', 'managed', 'google', 'gemini-2.5-flash') as reserve_ai_usage`,
      )
      return result.rows[0]?.reserve_ai_usage
    })
    expect(reused).toMatchObject({ reused: true, status: "reserved" })

    const usage = await asUser(grace, async () => {
      const result = await db.query<{ id: string }>(
        "select id from public.ai_usage_events where idempotency_key = 'grace-managed-1'",
      )
      await db.query("select public.void_ai_usage($1, 'transient')", [result.rows[0]?.id])
      const reopened = await db.query<{ reserve_ai_usage: { reopened: boolean; status: string } }>(
        `select public.reserve_ai_usage('grace-managed-1', 'managed', 'google', 'gemini-2.5-flash') as reserve_ai_usage`,
      )
      await db.query("select public.finalize_ai_usage($1, 10, 5, null)", [result.rows[0]?.id])
      const second = await db.query<{ finalize_ai_usage: { reused: boolean; status: string } }>(
        "select public.finalize_ai_usage($1, 99, 99, 1) as finalize_ai_usage",
        [result.rows[0]?.id],
      )
      const stored = await db.query<{ input_tokens: number }>(
        "select input_tokens from public.ai_usage_events where id = $1",
        [result.rows[0]?.id],
      )
      return {
        reopened: reopened.rows[0]?.reserve_ai_usage,
        finalize: second.rows[0]?.finalize_ai_usage,
        tokens: stored.rows[0]?.input_tokens,
      }
    })
    expect(usage.reopened).toMatchObject({ reopened: true, status: "reserved" })
    expect(usage.finalize).toMatchObject({ reused: true, status: "succeeded" })
    expect(usage.tokens).toBe(10)

    await db.exec("reset role")
    await db.query(
      `insert into public.ai_usage_events (
         user_id, idempotency_key, execution_mode, provider, model, billed_to, status, expires_at
       ) values ($1, 'grace-expired-seed', 'byok', 'openai', 'gpt-5.4-mini', 'user', 'reserved', now() - interval '1 minute')`,
      [grace],
    )
    const expired = await asUser(grace, async () => {
      await db.query(
        `select public.reserve_ai_usage('grace-expired-other', 'byok', 'openai', 'gpt-5.4-mini')`,
      )
      const row = await db.query<{ status: string }>(
        "select status from public.ai_usage_events where idempotency_key = 'grace-expired-seed'",
      )
      return row.rows[0]?.status
    })
    expect(expired).toBe("expired")

    const cross = await asUser(ada, async () => {
      const result = await db.query("select id from public.ai_usage_events")
      return result.rows.length
    })
    expect(cross).toBe(2)
  })

  it("rejects an invalid verification insert and leaves V1 tables intact", async () => {
    await expect(
      asUser(ada, () =>
        db.query(
          `insert into public.skill_entries (profile_id, verification_state, approved_at, name)
           select id, 'suggested', now(), 'Sneaky' from public.career_profiles`,
        ),
      ),
    ).rejects.toThrow()

    const companies = await db.query(
      "select to_regclass('public.companies') as companies, to_regclass('public.applications') as applications",
    )
    expect(companies.rows[0]).toEqual({
      companies: "companies",
      applications: "applications",
    })
  })
})
