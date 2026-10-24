import type { SourceActivation } from "@/lib/jobs/sources/policy"
import { ingestionAllowed } from "@/lib/jobs/sources/policy"
import type { NormalizedJob } from "@/lib/jobs/normalize"

export type SourceRefreshPlan =
  | { action: "skip"; reason: string }
  | { action: "failure"; reason: string }
  | { action: "apply"; jobs: NormalizedJob[]; complete: boolean }

/** A failed fetch never expires listings. Callers record the failure and leave current rows alone. */
export async function planSourceRefresh(input: {
  ingestion: boolean
  source: SourceActivation
  fetchJobs: () => Promise<{ jobs: NormalizedJob[]; complete: boolean }>
}): Promise<SourceRefreshPlan> {
  const allowed = ingestionAllowed(input.source, { ingestion: input.ingestion })
  if (!allowed.ok) return { action: "skip", reason: allowed.reason }
  try {
    const page = await input.fetchJobs()
    return { action: "apply", jobs: page.jobs, complete: page.complete }
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : "source_request_failed"
    return { action: "failure", reason: reason.slice(0, 300) }
  }
}
