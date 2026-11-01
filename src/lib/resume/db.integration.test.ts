// @vitest-environment node
import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const migrationsDir = path.join(process.cwd(), "supabase/migrations")

/** auth, roles, and a minimal stand-in for Supabase's storage schema, so the bucket and policy block runs. */
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

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid()
);
create function storage.foldername(name text) returns text[]
language sql immutable
as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
`

const content = JSON.stringify({ contact: { name: null, email: null, phone: null, location: null, links: [] }, summary: null, experience: [], education: [], skills: [], projects: [], other: [] })

describe("resume studio database", () => {
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

  const path_ = (owner: string, ext = "pdf") => `${owner}/${randomUUID()}.${ext}`

  async function resume(owner: string) {
    return as(owner, async () => {
      const row = await db.query<{ id: string }>(
        `insert into public.resumes (label, storage_path, mime, size_bytes, sha256, extracted_text)
         values ('Resume', $1, 'application/pdf', 1000, $2, 'Avery Quill resume text') returning id`,
        [path_(owner), randomUUID().replace(/-/g, "").padEnd(64, "a").slice(0, 64)],
      )
      return row.rows[0]!.id
    })
  }

  async function application(owner: string) {
    return as(owner, async () => {
      const company = await db.query<{ id: string }>("insert into public.companies (name) values ('Fictional Co') returning id")
      const row = await db.query<{ id: string }>(
        "insert into public.applications (company_id, job_title, status) values ($1, 'Engineer', 'saved') returning id",
        [company.rows[0]!.id],
      )
      return row.rows[0]!.id
    })
  }

  async function analysis(owner: string) {
    return as(owner, async () => {
      const row = await db.query<{ id: string }>(
        `insert into public.job_analyses (source, jd_text, jd_hash, profile_fingerprint, prompt_version, schema_version,
           provider, model, execution_mode, status, requirements, matches)
         values ('pasted', $1, $2, $3, 'p', 's', 'google', 'gemini-3.8-flash', 'byok', 'complete', '[]', '[]') returning id`,
        ["J".repeat(220), randomUUID().replace(/-/g, "").padEnd(64, "b").slice(0, 64), "c".repeat(64)],
      )
      return row.rows[0]!.id
    })
  }

  async function version(owner: string, links: { resumeId?: string | null; analysisId?: string | null; applicationId?: string | null }) {
    return as(owner, async () => {
      const row = await db.query<{ id: string }>(
        `insert into public.resume_versions (resume_id, analysis_id, application_id, label, base_content, final_content,
           prompt_version, schema_version, provider, model, execution_mode)
         values ($1, $2, $3, 'Tailored', $4::jsonb, $4::jsonb, 'p', 's', 'google', 'gemini-3.8-flash', 'byok') returning id`,
        [links.resumeId ?? null, links.analysisId ?? null, links.applicationId ?? null, content],
      )
      return row.rows[0]!.id
    })
  }

  it("keeps resumes and versions private to their owner", async () => {
    const resumeId = await resume(ada)
    const versionId = await version(ada, { resumeId })
    for (const table of ["resumes", "resume_versions"]) {
      const seen = await as(grace, () => db.query(`select id from public.${table}`))
      expect(seen.rows).toEqual([])
      const updated = await as(grace, () => db.query(`update public.${table} set label = 'x' returning id`))
      expect(updated.rows).toEqual([])
      const deleted = await as(grace, () => db.query(`delete from public.${table} returning id`))
      expect(deleted.rows).toEqual([])
    }
    await expect(as(null, () => db.query("select id from public.resumes"))).rejects.toThrow(/permission denied/)
    await expect(as(grace, () => db.query("update public.resume_versions set user_id = $1 where id = $2", [grace, versionId]))).resolves.toMatchObject({
      rows: [],
    })
    // Another user's id is replaced by the caller's, and then the path no longer matches the owner.
    await expect(
      as(grace, () =>
        db.query(
          `insert into public.resumes (user_id, label, storage_path, mime, size_bytes, sha256, extracted_text)
           values ($1, 'x', $2, 'application/pdf', 10, $3, 'text')`,
          [ada, path_(ada), "d".repeat(64)],
        ),
      ),
    ).rejects.toThrow(/resumes_path_check/)
  })

  it("rejects bad paths, types, and sizes in the resume row", async () => {
    const insert = (storagePath: string, mime = "application/pdf", size = 10) =>
      as(ada, () =>
        db.query(
          `insert into public.resumes (label, storage_path, mime, size_bytes, sha256, extracted_text) values ('x', $1, $2, $3, $4, 'text')`,
          [storagePath, mime, size, randomUUID().replace(/-/g, "").padEnd(64, "e").slice(0, 64)],
        ),
      )
    await expect(insert(`${ada}/../${grace}/${randomUUID()}.pdf`)).rejects.toThrow(/resumes_path_check/)
    await expect(insert(`${ada}/${randomUUID()}.exe`)).rejects.toThrow(/resumes_path_check/)
    await expect(insert(path_(ada), "text/html")).rejects.toThrow(/resumes_mime_check/)
    await expect(insert(path_(ada), "application/pdf", 5 * 1024 * 1024 + 1)).rejects.toThrow(/resumes_size_check/)
  })

  it("creates a private 5 MB PDF/DOCX bucket and limits objects to the owner's exact prefix", async () => {
    const bucket = await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'resumes'")
    expect(bucket.rows).toEqual([
      {
        public: false,
        file_size_limit: 5242880,
        allowed_mime_types: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      },
    ])
    const put = (user: string | null, name: string) =>
      as(user, () => db.query("insert into storage.objects (bucket_id, name) values ('resumes', $1) returning name", [name]))
    const own = path_(ada)
    await expect(put(ada, own)).resolves.toMatchObject({ rows: [{ name: own }] })
    await expect(put(ada, path_(ada, "docx"))).resolves.toBeTruthy()
    for (const name of [
      path_(grace),
      `${ada}/../${grace}/${randomUUID()}.pdf`,
      `${ada}/sub/${randomUUID()}.pdf`,
      `${ada}/${randomUUID()}.html`,
      `${ada}/${randomUUID()}.PDF`,
      `/${ada}/${randomUUID()}.pdf`,
    ]) {
      await expect(put(ada, name)).rejects.toThrow(/row-level security/)
    }
    await expect(put(null, path_(ada))).rejects.toThrow(/row-level security/)

    expect((await as(grace, () => db.query("select name from storage.objects where bucket_id = 'resumes'"))).rows).toEqual([])
    expect((await as(grace, () => db.query("delete from storage.objects where name = $1 returning name", [own]))).rows).toEqual([])
    expect((await as(ada, () => db.query("update storage.objects set name = $1 where name = $2 returning name", [path_(ada), own]))).rows).toEqual([])
    expect((await as(ada, () => db.query("select name from storage.objects where name = $1", [own]))).rows).toHaveLength(1)
    expect((await as(ada, () => db.query("delete from storage.objects where name = $1 returning name", [own]))).rows).toHaveLength(1)
  })

  it("rejects linking another user's application or analysis", async () => {
    const graceApplication = await application(grace)
    const graceAnalysis = await analysis(grace)
    await expect(version(ada, { applicationId: graceApplication })).rejects.toThrow(/resume_versions_application_fkey/)
    await expect(version(ada, { analysisId: graceAnalysis })).rejects.toThrow(/analysis not owned/)
    const graceResume = await resume(grace)
    await expect(version(ada, { resumeId: graceResume })).rejects.toThrow(/resume_versions_resume_fkey/)
    const versionId = await version(ada, {})
    await expect(
      as(ada, () => db.query("update public.resume_versions set analysis_id = $1 where id = $2", [graceAnalysis, versionId])),
    ).rejects.toThrow(/analysis not owned/)
  })

  it("never blocks deleting a linked application, analysis, or resume, with or without a session", async () => {
    const resumeId = await resume(ada)
    const applicationId = await application(ada)
    const analysisId = await analysis(ada)
    const versionId = await version(ada, { resumeId, applicationId, analysisId })
    const links = async () =>
      (
        await db.query<{ resume_id: string | null; analysis_id: string | null; application_id: string | null; final_content: unknown }>(
          "select resume_id, analysis_id, application_id, final_content from public.resume_versions where id = $1",
          [versionId],
        )
      ).rows[0]

    await as(ada, () => db.query("delete from public.applications where id = $1", [applicationId]))
    expect(await links()).toMatchObject({ application_id: null, analysis_id: analysisId, resume_id: resumeId })
    await as(ada, () => db.query("delete from public.job_analyses where id = $1", [analysisId]))
    expect(await links()).toMatchObject({ analysis_id: null, resume_id: resumeId })
    // No session, as a service or cascade cleanup would run.
    await db.query("delete from public.resumes where id = $1", [resumeId])
    expect(await links()).toMatchObject({ resume_id: null, analysis_id: null, application_id: null, final_content: JSON.parse(content) })

    // A version's other fields still cannot change without the owner's session.
    await expect(db.query("update public.resume_versions set label = 'x' where id = $1", [versionId])).rejects.toThrow(/not authenticated/)
  })

  it("revokes the guard from anon and grants no new rights to anon", async () => {
    const grants = await db.query<{ privilege_type: string; table_name: string }>(
      "select privilege_type, table_name from information_schema.role_table_grants where grantee = 'anon' and table_name in ('resumes', 'resume_versions')",
    )
    expect(grants.rows).toEqual([])
    const execute = await db.query<{ ok: boolean }>("select has_function_privilege('anon', 'public.guard_resume_version()', 'execute') as ok")
    expect(execute.rows[0]?.ok).toBe(false)
  })
})
