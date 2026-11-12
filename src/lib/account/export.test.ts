// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { buildAccountExport, EXPORT_TABLES } from "@/lib/account/export"

const createClient = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "user-1", email: "ada@example.com" })) }))
vi.mock("@/lib/supabase/server", () => ({ createClient }))

/** Same minimal auth and storage stand-ins as the other PGlite tests, so every migration runs. */
const bootstrap = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid default auth.uid());
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
`

describe("account export coverage", () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } })
    await db.exec(bootstrap)
    const dir = path.join(process.cwd(), "supabase/migrations")
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await db.exec(readFileSync(path.join(dir, file), "utf8"))
  }, 60_000)
  afterAll(async () => db?.close())

  it("exports every table that holds a user's rows, and every one of them is deleted with the account", async () => {
    const owned = await db.query<{ table: string; rule: string; column: string }>(`
      select k.relname as table, c.confdeltype as rule, a.attname as column
      from pg_constraint c
      join pg_class k on k.oid = c.conrelid
      join pg_namespace n on n.oid = k.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public'`)
    const tables = owned.rows.map((row) => row.table)
    // ai_credentials is exported separately, without key material.
    expect([...EXPORT_TABLES, "ai_credentials"].sort()).toEqual([...tables].sort())
    expect(owned.rows.every((row) => row.rule === "c" && row.column === "user_id")).toBe(true)
  })
})

describe("buildAccountExport", () => {
  const queried: Array<{ table: string; columns: string; filter: [string, string] | null }> = []
  beforeEach(() => {
    queried.length = 0
    createClient.mockResolvedValue({
      from: (table: string) => ({
        select: (columns: string) => {
          const entry = { table, columns, filter: null as [string, string] | null }
          queried.push(entry)
          const chain = {
            eq: (column: string, value: string) => {
              entry.filter = [column, value]
              return chain
            },
            limit: async () => (table === "job_alert_deliveries" ? { data: null, error: { code: "42P01" } } : { data: [{ id: `${table}-1`, user_id: "user-1" }], error: null }),
            then: (resolve: (value: unknown) => void) => resolve({ data: [{ id: "cred-1", provider: "google", last_four: "abcd" }], error: null }),
          }
          return chain
        },
      }),
      storage: { from: () => ({ list: async () => ({ data: [{ name: "a.pdf" }], error: null }) }) },
    })
  })

  it("reads each table filtered to the user, never key material, and reports tables it could not read", async () => {
    const data = await buildAccountExport(new Date("2026-11-12T00:00:00Z"))
    expect(data.account).toEqual({ id: "user-1", email: "ada@example.com" })
    expect(Object.keys(data.tables)).toEqual([...EXPORT_TABLES])
    expect(queried.every((entry) => entry.filter?.[0] === "user_id" && entry.filter[1] === "user-1")).toBe(true)
    const credentials = queried.find((entry) => entry.table === "ai_credentials")!
    expect(credentials.columns).not.toMatch(/ciphertext|nonce|auth_tag/)
    expect(data.providerKeys).toEqual([{ id: "cred-1", provider: "google", last_four: "abcd" }])
    expect(data.resumeFiles).toEqual(["user-1/a.pdf"])
    expect(data.errors).toEqual(["job_alert_deliveries: not exported (42P01)"])
    expect(data.tables.job_alert_deliveries).toEqual([])
  })
})
