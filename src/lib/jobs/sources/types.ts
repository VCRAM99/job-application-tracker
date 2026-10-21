import type { SourceLoader } from "@/lib/jobs/sources/http"
import { fetchApprovedJson } from "@/lib/jobs/sources/http"
import { SourceRequestError } from "@/lib/jobs/urls"

export type AdapterPage<T> = {
  jobs: T[]
  rejected: Array<{ sourceJobId: string | null; reason: string }>
  nextCursor: string | null
  complete: boolean
}

export type FetchInput = {
  sourceIdentifier: string
  region: "global" | "eu"
  employerName: string | null
  employerDomain: string
  cursor?: string | null
  signal?: AbortSignal
  now: Date
  /** Fixture or test loader. Live HTTP is used only when this is omitted and permitLiveFetch is true. */
  load?: SourceLoader
  permitLiveFetch?: boolean
}

export async function loadPayload(url: string, input: FetchInput): Promise<unknown> {
  if (input.load) return input.load(url)
  if (!input.permitLiveFetch) throw new SourceRequestError("live_fetch_not_permitted")
  return fetchApprovedJson(url, { signal: input.signal })
}
