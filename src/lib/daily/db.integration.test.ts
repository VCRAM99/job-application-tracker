// @vitest-environment node

import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { goalsFromRow } from "@/lib/daily/data"

const migrationsDir = path.join(process.cwd(), "supabase/migrations")
const PREFERENCES_MIGRATION = "20261112120000_daily_preferences.sql"

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

describe("daily preferences migration", () => {
  let db: PGlite
  const ada = randomUUID()
  const grace = randomUUID()

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

  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } })
    await db.exec(bootstrap)
    const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
    // Everything before the new migration, then a row saved the old way, then the migration.
    for (const file of files.filter((name) => name < PREFERENCES_MIGRATION)) await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"))
    await db.query("insert into auth.users (id) values ($1), ($2)", [ada, grace])
    await as(ada, () => db.query("insert into public.health_goals (calorie_target, protein_target, water_increment_ml, weight_unit) values (2200, 160, 300, 'lb')"))
    for (const file of files.filter((name) => name >= PREFERENCES_MIGRATION)) await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"))
  }, 60_000)

  afterAll(async () => db?.close())

  it("keeps a row saved before the migration, with defaults for the new settings", async () => {
    const row = await as(ada, () => db.query<Record<string, unknown>>("select * from public.health_goals"))
    expect(row.rows).toHaveLength(1)
    expect(row.rows[0]).toMatchObject({ calorie_target: 2200, water_increment_ml: 300, weight_unit: "lb", goal_mode: null, protein_direction: null, hidden_metrics: null })
    expect(goalsFromRow(row.rows[0] as never)).toMatchObject({ calorieTarget: 2200, proteinTarget: 160, goalMode: "bulk", proteinDirection: "follow", hiddenMetrics: [] })
  })

  it("lets the owner save goal mode, protein direction, and hidden metrics", async () => {
    await as(ada, () => db.query("update public.health_goals set goal_mode = 'cut', protein_direction = 'reach', hidden_metrics = array['sleep', 'weight']"))
    const row = await as(ada, () => db.query<Record<string, unknown>>("select goal_mode, protein_direction, hidden_metrics from public.health_goals"))
    expect(row.rows[0]).toEqual({ goal_mode: "cut", protein_direction: "reach", hidden_metrics: ["sleep", "weight"] })
  })

  it("keeps preferences private to their owner", async () => {
    const read = await as(grace, () => db.query("select * from public.health_goals"))
    expect(read.rows).toHaveLength(0)
    const changed = await as(grace, () => db.query("update public.health_goals set goal_mode = 'bulk' where user_id = $1", [ada]))
    expect(changed.affectedRows ?? 0).toBe(0)
    const anon = await as(null, () => db.query("select * from public.health_goals").catch((error: Error) => error))
    expect(anon).toBeInstanceOf(Error)
  })

  it("rejects values outside the allowed sets", async () => {
    for (const statement of [
      "update public.health_goals set goal_mode = 'maintain'",
      "update public.health_goals set protein_direction = 'never'",
      "update public.health_goals set hidden_metrics = array['sleep', 'mood']",
    ]) {
      await expect(as(ada, () => db.query(statement))).rejects.toThrow(/violates check constraint/)
    }
  })

  it("lets a new user insert preferences with the new columns on first save", async () => {
    await as(grace, () => db.query("insert into public.health_goals (goal_mode, hidden_metrics) values ('cut', array['food'])"))
    const row = await as(grace, () => db.query<Record<string, unknown>>("select user_id, goal_mode, hidden_metrics, water_increment_ml from public.health_goals"))
    expect(row.rows[0]).toEqual({ user_id: grace, goal_mode: "cut", hidden_metrics: ["food"], water_increment_ml: 250 })
  })
})
