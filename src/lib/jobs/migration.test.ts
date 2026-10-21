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
