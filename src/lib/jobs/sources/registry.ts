import { fetchAshbyJobs } from "@/lib/jobs/sources/ashby"
import { fetchGreenhouseJobs } from "@/lib/jobs/sources/greenhouse"
import { fetchLeverJobs } from "@/lib/jobs/sources/lever"
import type { AdapterPage, FetchInput } from "@/lib/jobs/sources/types"
import type { JobProvider, NormalizedJob } from "@/lib/jobs/normalize"
import { SourceRequestError } from "@/lib/jobs/urls"

export type JobSourceAdapter = {
  provider: JobProvider
  validateConfig(input: { sourceIdentifier: string; region: "global" | "eu" }): boolean
  fetchPublishedJobs(input: FetchInput): Promise<AdapterPage<NormalizedJob>>
}

export const JOB_SOURCE_ADAPTERS: Record<JobProvider, JobSourceAdapter> = {
  greenhouse: {
    provider: "greenhouse",
    validateConfig(input) {
      return /^[A-Za-z0-9_-]{1,80}$/.test(input.sourceIdentifier)
    },
    fetchPublishedJobs: fetchGreenhouseJobs,
  },
  lever: {
    provider: "lever",
    validateConfig(input) {
      return /^[A-Za-z0-9_-]{1,80}$/.test(input.sourceIdentifier) && (input.region === "global" || input.region === "eu")
    },
    fetchPublishedJobs: fetchLeverJobs,
  },
  ashby: {
    provider: "ashby",
    validateConfig(input) {
      return /^[A-Za-z0-9_-]{1,80}$/.test(input.sourceIdentifier)
    },
    fetchPublishedJobs: fetchAshbyJobs,
  },
}

export function adapterFor(provider: string): JobSourceAdapter {
  if (provider !== "greenhouse" && provider !== "lever" && provider !== "ashby") {
    throw new SourceRequestError("unsupported_provider")
  }
  return JOB_SOURCE_ADAPTERS[provider]
}
