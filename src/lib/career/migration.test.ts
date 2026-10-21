import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const migrationsDir = path.join(process.cwd(), "supabase/migrations")
const careerFile = "20261021043000_career_knowledge_and_ai.sql"
const sql = readFileSync(path.join(migrationsDir, careerFile), "utf8").toLowerCase()

describe("career migration safety", () => {
  it("is the additive career and AI migration", () => {
    expect(readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"))).toContain(careerFile)
  })

  it("does not rewrite V1 tables or grant the service role", () => {
    expect(sql).not.toContain("service_role")
    expect(sql).not.toContain("drop table")
    expect(sql).not.toContain("alter table public.companies")
    expect(sql).not.toContain("alter table public.applications")
    expect(sql).not.toContain("alter table public.contacts")
    expect(sql).not.toContain("alter table public.tasks")
    expect(sql).not.toContain("alter table public.user_preferences")
    expect(sql).not.toContain("alter table public.health_goals")
  })

  it("keeps secrets out of the credential summary and audit row", () => {
    expect(sql).toContain("create view public.ai_credential_summaries")
    expect(sql).toContain("revoke insert, update, delete, select on public.ai_credentials from authenticated")
    expect(sql).toContain("grant select (")
    expect(sql).not.toMatch(/ai_audit_events \([\s\S]*prompt/)
    expect(sql).toContain("security definer")
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain("create table public.ai_accounting_gate")
    expect(sql).toContain("revoke all on function public.assert_ai_accounting_proof(text, text) from public, anon, authenticated")
    expect(sql).not.toContain("grant execute on function public.assert_ai_accounting_proof")
    expect(sql).toContain("revoke insert, update, delete on table public.ai_suggestions from authenticated")
    expect(sql).not.toContain("grant execute on function public.optional_date")
  })
})
