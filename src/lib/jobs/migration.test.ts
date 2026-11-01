import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261021120000_recommended_jobs.sql"),
  "utf8",
).toLowerCase()

describe("recommended jobs migration safety", () => {
  it("adds the catalog without granting a service role or dropping v1 tables", () => {
    expect(sql).not.toContain("service_role")
    expect(sql).not.toContain("drop table")
    expect(sql).not.toContain("add constraint applications_user_id_id_key")
    expect(sql).toContain("references public.applications (user_id, id)")
    expect(sql).not.toContain("alter table public.companies")
    expect(sql).toContain("create table public.job_catalog_gate")
    expect(sql).toContain("revoke all on function public.assert_job_operation_proof")
    expect(sql).not.toContain("grant execute on function public.assert_job_operation_proof")
    expect(sql).toContain("live_ingestion_enabled")
    expect(sql).toContain("terms_status")
  })
})

describe("jobs activation migration safety", () => {
  const activation = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261028120000_jobs_activation.sql"),
    "utf8",
  ).toLowerCase()

  it("changes no table, grant, or policy beyond the new list function", () => {
    expect(activation).not.toContain("service_role")
    expect(activation).not.toMatch(/\b(drop|alter|truncate)\s+(table|policy|function|schema)\b/)
    expect(activation).not.toContain("create table")
    expect(activation).not.toContain("create policy")
    expect(activation.match(/^grant /gm)).toEqual(["grant "])
    expect(activation).toContain("grant execute on function public.list_job_ingestion_sources(text, text) to anon, authenticated")
    expect(activation).toContain("create or replace function public.apply_job_catalog(p_payload text, p_proof text)")
    expect(activation).toContain("perform public.assert_job_operation_proof('apply-catalog', p_payload, p_proof)")
    expect(activation).toContain("on conflict (source_id, source_job_id) do update")
  })
})

describe("chunked apply migration safety", () => {
  const chunked = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261101120000_jobs_chunked_apply.sql"),
    "utf8",
  ).toLowerCase()

  it("only replaces apply_job_catalog and keeps its proof and live-source gate", () => {
    expect(chunked).not.toContain("service_role")
    expect(chunked).not.toMatch(/\b(drop|alter|truncate)\s+(table|policy|function|schema)\b/)
    expect(chunked).not.toMatch(/^(grant|revoke|create table|create policy)/m)
    expect(chunked.match(/create or replace function public\.(\w+)/g)).toEqual(["create or replace function public.apply_job_catalog"])
    expect(chunked).toContain("perform public.assert_job_operation_proof('apply-catalog', p_payload, p_proof)")
    expect(chunked).toContain("'source_not_live'")
    expect(chunked).toContain("on conflict (source_id, source_job_id) do update")
  })
})
