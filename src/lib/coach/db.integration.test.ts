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
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`

const META = `'p', 's', 'google', 'gemini-3.8-flash', 'byok'`
const TABLES = ["research_briefs", "interview_question_sets", "practice_answers", "story_bank_entries", "coach_drafts", "follow_up_suggestion_states"]

describe("career coach database", () => {
  let db: PGlite
  const ada = randomUUID()
  const grace = randomUUID()

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } })
    await db.exec(bootstrap)
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"))
    }
    await db.query("insert into auth.users (id) values ($1), ($2)", [ada, grace])
  }, 60000)

  afterAll(async () => {
    await db?.close()
  })

  async function as<T>(userId: string | null, run: () => Promise<T>) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false)`)
    await db.exec(userId ? "set role authenticated" : "set role anon")
    try {
      return await run()
    } finally {
      await db.exec("reset role")
      await db.exec("select set_config('request.jwt.claim.sub', '', false)")
    }
  }

  const one = async (userId: string, sql: string, params: unknown[] = []) =>
    as(userId, async () => (await db.query<{ id: string }>(sql, params)).rows[0]!.id)

  async function world(owner: string) {
    const company = await one(owner, "insert into public.companies (name) values ('Fictional Co') returning id")
    const application = await one(owner, "insert into public.applications (company_id, job_title, status) values ($1, 'Engineer', 'applied') returning id", [company])
    const contact = await one(owner, "insert into public.contacts (name, email, application_id) values ('Dana Reyes', 'dana@example.com', $1) returning id", [application])
    const task = await one(owner, "insert into public.tasks (title) values ('Prep') returning id")
    const analysis = await one(
      owner,
      `insert into public.job_analyses (source, application_id, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version,
         provider, model, execution_mode, status, requirements, matches)
       values ('application', $1, $2, $3, $4, ${META}, 'complete', '[]', '[]') returning id`,
      [application, "J".repeat(220), randomUUID().replace(/-/g, "").padEnd(64, "b").slice(0, 64), "c".repeat(64)],
    )
    const brief = await one(
      owner,
      `insert into public.research_briefs (company_id, application_id, label, sources, prompt_version, schema_version, provider, model, execution_mode)
       values ($1, $2, 'Brief', '[{"id":"S1"}]', ${META}) returning id`,
      [company, application],
    )
    const set = await one(
      owner,
      `insert into public.interview_question_sets (application_id, analysis_id, label, prompt_version, schema_version, provider, model, execution_mode)
       values ($1, $2, 'Set', ${META}) returning id`,
      [application, analysis],
    )
    const answer = await one(
      owner,
      `insert into public.practice_answers (set_id, question_id, answer, prompt_version, schema_version, provider, model, execution_mode)
       values ($1, 'q-0', 'My answer', ${META}) returning id`,
      [set],
    )
    const story = await one(
      owner,
      `insert into public.story_bank_entries (competency, fact_ids, outline, prompt_version, schema_version, provider, model, execution_mode)
       values ('impact', '["f1"]', '{}', ${META})
       on conflict (user_id, competency) do update set outline = excluded.outline returning id`,
    )
    const draft = await one(
      owner,
      `insert into public.coach_drafts (kind, format, contact_id, application_id, analysis_id, brief_id, body, prompt_version, schema_version, provider, model, execution_mode)
       values ('outreach_recruiter', 'email', $1, $2, $3, $4, 'Hi Dana, thanks.', ${META}) returning id`,
      [contact, application, analysis, brief],
    )
    const state = await one(owner, `insert into public.follow_up_suggestion_states (suggestion_key, task_id) values ($1, $2) returning id`, [
      `applied_stale:${application}:2026-10-01`,
      task,
    ])
    return { company, application, contact, task, analysis, brief, set, answer, story, draft, state }
  }

  it("keeps every coach table private to its owner", async () => {
    await world(ada)
    for (const table of TABLES) {
      expect((await as(ada, () => db.query(`select id from public.${table}`))).rows.length).toBeGreaterThan(0)
      expect((await as(grace, () => db.query(`select id from public.${table}`))).rows).toEqual([])
      expect((await as(grace, () => db.query(`update public.${table} set updated_at = now() returning id`))).rows).toEqual([])
      expect((await as(grace, () => db.query(`delete from public.${table} returning id`))).rows).toEqual([])
      await expect(as(null, () => db.query(`select id from public.${table}`))).rejects.toThrow(/permission denied/)
    }
  })

  it("assigns the caller as owner and refuses to change it", async () => {
    const own = await world(grace)
    const row = await as(grace, () => db.query<{ user_id: string }>("select user_id from public.coach_drafts where id = $1", [own.draft]))
    expect(row.rows[0]!.user_id).toBe(grace)
    await expect(as(grace, () => db.query("update public.coach_drafts set user_id = $1 where id = $2", [ada, own.draft]))).rejects.toThrow()
  })

  it("rejects links to another user's rows", async () => {
    const theirs = await world(ada)
    const attempts: Array<[string, unknown[]]> = [
      [`insert into public.coach_drafts (kind, format, contact_id, body, prompt_version, schema_version, provider, model, execution_mode) values ('follow_up', 'message', $1, 'x', ${META})`, [theirs.contact]],
      [`insert into public.coach_drafts (kind, format, application_id, body, prompt_version, schema_version, provider, model, execution_mode) values ('follow_up', 'message', $1, 'x', ${META})`, [theirs.application]],
      [`insert into public.coach_drafts (kind, format, analysis_id, body, prompt_version, schema_version, provider, model, execution_mode) values ('follow_up', 'message', $1, 'x', ${META})`, [theirs.analysis]],
      [`insert into public.coach_drafts (kind, format, brief_id, body, prompt_version, schema_version, provider, model, execution_mode) values ('follow_up', 'message', $1, 'x', ${META})`, [theirs.brief]],
      [`insert into public.research_briefs (company_id, label, sources, prompt_version, schema_version, provider, model, execution_mode) values ($1, 'B', '[{}]', ${META})`, [theirs.company]],
      [`insert into public.research_briefs (application_id, label, sources, prompt_version, schema_version, provider, model, execution_mode) values ($1, 'B', '[{}]', ${META})`, [theirs.application]],
      [`insert into public.interview_question_sets (analysis_id, label, prompt_version, schema_version, provider, model, execution_mode) values ($1, 'S', ${META})`, [theirs.analysis]],
      [`insert into public.interview_question_sets (application_id, label, prompt_version, schema_version, provider, model, execution_mode) values ($1, 'S', ${META})`, [theirs.application]],
      [`insert into public.practice_answers (set_id, question_id, answer, prompt_version, schema_version, provider, model, execution_mode) values ($1, 'q-1', 'a', ${META})`, [theirs.set]],
      [`insert into public.follow_up_suggestion_states (suggestion_key, task_id) values ($1, $2)`, [`thank_you:${theirs.application}:x`, theirs.task]],
    ]
    for (const [sql, params] of attempts) {
      await expect(as(grace, () => db.query(sql, params))).rejects.toThrow(/not owned|violates foreign key|row-level security/)
    }
    // Moving an existing row's link to someone else's row is rejected too.
    const mine = await world(grace)
    await expect(as(grace, () => db.query("update public.coach_drafts set contact_id = $1 where id = $2", [theirs.contact, mine.draft]))).rejects.toThrow(/not owned/)
    await expect(as(grace, () => db.query("update public.follow_up_suggestion_states set task_id = $1 where id = $2", [theirs.task, mine.state]))).rejects.toThrow(/not owned/)
  })

  it("never blocks deleting a linked application, contact, company, analysis, brief, or task", async () => {
    const w = await world(ada)
    await as(ada, () => db.query("delete from public.contacts where id = $1", [w.contact]))
    await as(ada, () => db.query("delete from public.job_analyses where id = $1", [w.analysis]))
    await as(ada, () => db.query("delete from public.tasks where id = $1", [w.task]))
    await as(ada, () => db.query("delete from public.research_briefs where id = $1", [w.brief]))
    await as(ada, () => db.query("delete from public.applications where id = $1", [w.application]))
    await as(ada, () => db.query("delete from public.companies where id = $1", [w.company]))
    const draft = await as(ada, () => db.query("select contact_id, application_id, analysis_id, brief_id from public.coach_drafts where id = $1", [w.draft]))
    expect(draft.rows).toEqual([{ contact_id: null, application_id: null, analysis_id: null, brief_id: null }])
    const set = await as(ada, () => db.query("select application_id, analysis_id from public.interview_question_sets where id = $1", [w.set]))
    expect(set.rows).toEqual([{ application_id: null, analysis_id: null }])
    const state = await as(ada, () => db.query("select task_id from public.follow_up_suggestion_states where id = $1", [w.state]))
    expect(state.rows).toEqual([{ task_id: null }])
    // Deleting a question set removes its practice answers with it.
    await as(ada, () => db.query("delete from public.interview_question_sets where id = $1", [w.set]))
    expect((await as(ada, () => db.query("select id from public.practice_answers where id = $1", [w.answer]))).rows).toEqual([])
  })

  it("links only a readable catalog posting and clears a deleted one without a session", async () => {
    await db.query(
      `insert into public.job_sources (
         provider, slug, display_name, access_method, approved_usage, attribution_requirements,
         retention_restrictions, allowed_storage_fields, approval_status, terms_status
       ) values
       ('greenhouse', 'greenhouse:coach-approved', 'Approved', 'documented_https_json', 'use', 'attr', 'keep', '{title}', 'approved', 'permitted'),
       ('greenhouse', 'greenhouse:coach-draft', 'Draft', 'documented_https_json', 'use', 'attr', 'keep', '{title}', 'draft', 'unclear')`,
    )
    const sources = await db.query<{ id: string; slug: string }>("select id, slug from public.job_sources where slug like 'greenhouse:coach-%' order by slug")
    const posting = async (sourceId: string, key: string) =>
      (
        await db.query<{ id: string }>(
          `insert into public.job_postings (source_id, source_job_id, title, listing_url, content_hash, description_text)
           values ($1, $2, 'Engineer', $3, $4, 'text') returning id`,
          [sourceId, key, `https://example.com/jobs/${key}`, "a".repeat(64)],
        )
      ).rows[0]!.id
    const visible = await posting(sources.rows[0]!.id, "coach-visible")
    const hidden = await posting(sources.rows[1]!.id, "coach-hidden")
    const insert = (postingId: string) =>
      one(
        ada,
        `insert into public.research_briefs (posting_id, label, sources, prompt_version, schema_version, provider, model, execution_mode) values ($1, 'B', '[{}]', ${META}) returning id`,
        [postingId],
      )
    await expect(insert(hidden)).rejects.toThrow(/posting_id not owned/)
    const brief = await insert(visible)
    // A catalog delete runs without a user session.
    await db.query("delete from public.job_postings where id = $1", [visible])
    expect((await as(ada, () => db.query("select posting_id from public.research_briefs where id = $1", [brief]))).rows).toEqual([{ posting_id: null }])
  })

  it("deletes a user's coach rows with the account", async () => {
    const temp = randomUUID()
    await db.query("insert into auth.users (id) values ($1)", [temp])
    await world(temp)
    await db.query("delete from auth.users where id = $1", [temp])
    for (const table of TABLES) {
      expect((await db.query(`select id from public.${table} where user_id = $1`, [temp])).rows).toEqual([])
    }
  })

  it("marks only the caller's draft sent and updates only the caller's contact", async () => {
    const theirs = await world(ada)
    const today = (await db.query<{ d: string }>("select current_date::text as d")).rows[0]!.d
    await expect(as(grace, () => db.query("select public.mark_coach_draft_sent($1, $2::date)", [theirs.draft, today]))).rejects.toThrow(/draft not found/)
    await expect(as(null, () => db.query("select public.mark_coach_draft_sent($1, $2::date)", [theirs.draft, today]))).rejects.toThrow(/permission denied/)
    const before = await as(ada, () => db.query("select outreach_status, last_contacted_at from public.contacts where id = $1", [theirs.contact]))
    expect(before.rows).toEqual([{ outreach_status: "not_contacted", last_contacted_at: null }])

    await expect(as(ada, () => db.query("select public.mark_coach_draft_sent($1, '2000-01-01'::date)", [theirs.draft]))).rejects.toThrow(/invalid local date/)
    const marked = await as(ada, () => db.query<{ r: Record<string, unknown> }>("select public.mark_coach_draft_sent($1, $2::date) as r", [theirs.draft, today]))
    expect(marked.rows[0]!.r).toMatchObject({ already_sent: false, contact_updated: true })
    const after = await as(ada, () => db.query<{ outreach_status: string; last_contacted_at: unknown }>("select outreach_status, last_contacted_at from public.contacts where id = $1", [theirs.contact]))
    expect(after.rows[0]!.outreach_status).toBe("contacted")
    expect(after.rows[0]!.last_contacted_at).not.toBeNull()
    const again = await as(ada, () => db.query<{ r: Record<string, unknown> }>("select public.mark_coach_draft_sent($1, $2::date) as r", [theirs.draft, today]))
    expect(again.rows[0]!.r).toMatchObject({ already_sent: true, contact_updated: false })

    // A replied contact keeps its status; a connection note sets connection_sent.
    const w = await world(ada)
    await as(ada, () => db.query("update public.contacts set outreach_status = 'replied' where id = $1", [w.contact]))
    await as(ada, () => db.query("select public.mark_coach_draft_sent($1, $2::date)", [w.draft, today]))
    expect((await as(ada, () => db.query("select outreach_status from public.contacts where id = $1", [w.contact]))).rows).toEqual([{ outreach_status: "replied" }])
    const note = await one(
      ada,
      `insert into public.coach_drafts (kind, format, contact_id, body, prompt_version, schema_version, provider, model, execution_mode) values ('outreach_recruiter', 'connection_note', $1, 'Hi', ${META}) returning id`,
      [(await world(ada)).contact],
    )
    await as(ada, () => db.query("select public.mark_coach_draft_sent($1, $2::date)", [note, today]))
    const noted = await as(ada, () => db.query("select c.outreach_status from public.coach_drafts d join public.contacts c on c.id = d.contact_id where d.id = $1", [note]))
    expect(noted.rows).toEqual([{ outreach_status: "connection_sent" }])
    // An archived draft cannot be marked sent.
    const archived = await world(ada)
    await as(ada, () => db.query("update public.coach_drafts set status = 'archived' where id = $1", [archived.draft]))
    await expect(as(ada, () => db.query("select public.mark_coach_draft_sent($1, $2::date)", [archived.draft, today]))).rejects.toThrow(/archived/)
  })

  it("enforces draft length caps and sent-state consistency", async () => {
    const insert = (format: string, body: string, kind = "follow_up") =>
      as(ada, () =>
        db.query(
          `insert into public.coach_drafts (kind, format, body, prompt_text, prompt_version, schema_version, provider, model, execution_mode) values ($1, $2, $3, 'Why us?', ${META})`,
          [kind, format, body],
        ),
      )
    await expect(insert("connection_note", "x".repeat(301))).rejects.toThrow(/coach_drafts_body_check/)
    await expect(insert("connection_note", "x".repeat(300))).resolves.toBeTruthy()
    await expect(insert("message", "x".repeat(1201))).rejects.toThrow(/coach_drafts_body_check/)
    await expect(insert("email", "x".repeat(2501))).rejects.toThrow(/coach_drafts_body_check/)
    await expect(insert("answer", "x".repeat(10))).rejects.toThrow(/coach_drafts_format_check/)
    await expect(insert("answer", "x".repeat(10), "application_answer")).resolves.toBeTruthy()
    await expect(
      as(ada, () =>
        db.query(
          `insert into public.coach_drafts (kind, format, body, status, prompt_version, schema_version, provider, model, execution_mode) values ('follow_up', 'message', 'x', 'marked_sent', ${META})`,
        ),
      ),
    ).rejects.toThrow(/coach_drafts_sent_check/)
  })

  it("creates one task per follow-up suggestion", async () => {
    const w = await world(ada)
    const key = `applied_stale:${w.application}:2026-10-20`
    const call = () =>
      as(ada, () =>
        db.query<{ r: { task_id: string; created: boolean } }>("select public.create_follow_up_task($1, 'Follow up', 'd', null, $2) as r", [key, w.application]),
      )
    const first = (await call()).rows[0]!.r
    const second = (await call()).rows[0]!.r
    expect(first.created).toBe(true)
    expect(second).toEqual({ task_id: first.task_id, created: false })
    expect((await as(ada, () => db.query("select id from public.tasks where title = 'Follow up'"))).rows).toHaveLength(1)
    // Another user cannot reuse the key to reach the task, and the same key is separate per user.
    const theirs = await as(grace, () => db.query<{ r: { task_id: string; created: boolean } }>("select public.create_follow_up_task($1, 'Follow up', 'd', null, null) as r", [key]))
    expect(theirs.rows[0]!.r.task_id).not.toBe(first.task_id)
    await expect(as(grace, () => db.query("select public.create_follow_up_task($1, 'x', 'd', null, $2)", [`applied_stale:${w.application}:z`, w.application]))).rejects.toThrow()
    await expect(as(ada, () => db.query("select public.create_follow_up_task('bogus', 'x', 'd', null, null)"))).rejects.toThrow(/key_check/)
    await expect(as(null, () => db.query("select public.create_follow_up_task($1, 'x', 'd', null, null)", [key]))).rejects.toThrow(/permission denied/)
    // Once that task is deleted, the suggestion can create a new one.
    await as(ada, () => db.query("delete from public.tasks where id = $1", [first.task_id]))
    expect((await call()).rows[0]!.r.created).toBe(true)
  })

  it("records when an application's status changes and ignores client values", async () => {
    const w = await world(ada)
    const read = async () =>
      (await as(ada, () => db.query<{ s: string | null }>("select status_changed_at::text as s from public.applications where id = $1", [w.application]))).rows[0]!.s
    // A new or imported row has no observed status change (review #10).
    expect(await read()).toBeNull()
    await as(ada, () => db.query("update public.applications set status_changed_at = '2000-01-01' where id = $1", [w.application]))
    expect(await read()).toBeNull()
    await as(ada, () => db.query("update public.applications set notes = 'n' where id = $1", [w.application]))
    expect(await read()).toBeNull()
    await as(ada, () => db.query("update public.applications set status = 'recruiter_screen' where id = $1", [w.application]))
    const changed = await read()
    expect(changed).not.toBeNull()
    await as(ada, () => db.query("update public.applications set status_changed_at = '2000-01-01', notes = 'm' where id = $1", [w.application]))
    expect(await read()).toBe(changed)
  })

  it("adds a question to Preparation once, only from the caller's own set", async () => {
    const w = await world(ada)
    await as(ada, () =>
      db.query(
        `update public.interview_question_sets set questions = '[{"id":"q-0","text":"Q zero"},{"id":"q-1","text":"Q one"}]' where id = $1`,
        [w.set],
      ),
    )
    const add = (user: string, questionId = "q-1") =>
      as(user, () =>
        db.query<{ r: { preparation_id: string; created: boolean } }>(
          "select public.add_question_to_preparation($1, $2, 'Q one', 'behavioral', 'notes') as r",
          [w.set, questionId],
        ),
      )
    const first = (await add(ada)).rows[0]!.r
    const second = (await add(ada)).rows[0]!.r
    expect(first.created).toBe(true)
    expect(second).toEqual({ preparation_id: first.preparation_id, created: false })
    const stored = await as(ada, () => db.query<{ q: Array<Record<string, unknown>> }>("select questions as q from public.interview_question_sets where id = $1", [w.set]))
    expect(stored.rows[0]!.q[1]).toMatchObject({ id: "q-1", preparationItemId: first.preparation_id })
    expect(stored.rows[0]!.q[0]).not.toHaveProperty("preparationItemId")
    await expect(add(grace)).rejects.toThrow(/question set not found/)
    await expect(add(ada, "q-9")).rejects.toThrow(/question not found/)
    await expect(as(null, () => db.query("select public.add_question_to_preparation($1, 'q-1', 't', 'other', 'n')", [w.set]))).rejects.toThrow(/permission denied/)
  })

  it("does not let anon or public execute the new functions", async () => {
    const grants = await db.query<{ routine_name: string; grantee: string }>(
      `select routine_name, grantee from information_schema.routine_privileges
       where routine_name in ('guard_coach_row', 'mark_coach_draft_sent', 'create_follow_up_task', 'add_question_to_preparation', 'track_application_status_change')
         and grantee in ('anon', 'PUBLIC')`,
    )
    expect(grants.rows).toEqual([])
  })
})
