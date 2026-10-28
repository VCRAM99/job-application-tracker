import "server-only"

import type { CatalogCaller } from "@/lib/jobs/catalog-rpc"
import { jobIngestionEnabled } from "@/lib/jobs/flags"
import type { NormalizedJob } from "@/lib/jobs/normalize"
import { planSourceRefresh } from "@/lib/jobs/refresh"
import type { SourceActivation } from "@/lib/jobs/sources/policy"
import { adapterFor } from "@/lib/jobs/sources/registry"
import type { SourceLoader } from "@/lib/jobs/sources/http"
import { SourceRequestError } from "@/lib/jobs/urls"

type Env = Record<string, string | undefined>

/** apply_job_catalog rejects a batch over 500 postings. */
export const MAX_BATCH_POSTINGS = 500
const MAX_PAGES = 10

export type IngestionSource = SourceActivation & {
  slug: string
  region: "global" | "eu"
  employerName: string | null
  employerDomain: string
}

export type FetchedSource = { jobs: NormalizedJob[]; complete: boolean; rejected: number }

export type SourceOutcome =
  | {
      slug: string
      outcome: "applied"
      fetched: number
      inserted: number | null
      updated: number | null
      expired: number
      rejected: number
      completeSnapshot: boolean
      truncated: boolean
    }
  | { slug: string; outcome: "skipped"; reason: string }
  | { slug: string; outcome: "duplicate" }
  | { slug: string; outcome: "failed"; reason: string; recorded: boolean }
  | { slug: string; outcome: "error"; reason: string }

export type IngestionSummary =
  | { status: "completed"; window: string; sources: SourceOutcome[] }
  | { status: "inactive"; reason: string }
  | { status: "error"; reason: string }

/** One window per UTC hour, so a repeated or overlapping run in the same hour is a duplicate. */
export function ingestionWindow(now: Date): string {
  return now.toISOString().slice(0, 13)
}

export function ingestionKey(slug: string, now: Date): string {
  return `${slug}:${ingestionWindow(now)}`
}

/** Follows the adapter's cursor. A snapshot is complete only when the last page was reached cleanly. */
export async function fetchSourcePages(
  source: IngestionSource,
  now: Date,
  options: { load?: SourceLoader; permitLiveFetch: boolean },
): Promise<FetchedSource> {
  const adapter = adapterFor(source.provider)
  const identifier = source.sourceIdentifier ?? ""
  if (!adapter.validateConfig({ sourceIdentifier: identifier, region: source.region })) {
    throw new SourceRequestError("invalid_source_config")
  }
  const jobs: NormalizedJob[] = []
  let rejected = 0
  let malformed = false
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await adapter.fetchPublishedJobs({
      sourceIdentifier: identifier,
      region: source.region,
      employerName: source.employerName,
      employerDomain: source.employerDomain,
      cursor,
      now,
      load: options.load,
      permitLiveFetch: options.permitLiveFetch,
    })
    jobs.push(...result.jobs)
    rejected += result.rejected.length
    malformed ||= result.rejected.some((item) => item.reason === "malformed_payload")
    if (!result.nextCursor) return { jobs, complete: !malformed, rejected }
    cursor = result.nextCursor
  }
  return { jobs, complete: false, rejected }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parseSource(value: unknown): IngestionSource | null {
  const row = record(value)
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "")
  const slug = text("slug")
  if (!slug) return null
  const approval = text("approvalStatus")
  const terms = text("termsStatus")
  return {
    slug,
    provider: text("provider"),
    sourceIdentifier: text("sourceIdentifier") || null,
    region: text("region") === "eu" ? "eu" : "global",
    employerName: text("employerName") || null,
    employerDomain: text("employerDomain"),
    accessMethod: text("accessMethod"),
    approvedUsage: text("approvedUsage"),
    attributionRequirements: text("attributionRequirements"),
    retentionRestrictions: text("retentionRestrictions"),
    allowedStorageFields: Array.isArray(row.allowedStorageFields)
      ? row.allowedStorageFields.filter((item): item is string => typeof item === "string")
      : [],
    refreshLimitPerDay: count(row.refreshLimitPerDay) ?? 0,
    approvalStatus: approval === "approved" || approval === "revoked" ? approval : "draft",
    termsStatus: terms === "permitted" || terms === "restricted" ? terms : "unclear",
    liveIngestionEnabled: row.liveIngestionEnabled === true,
  }
}

async function ingestSource(
  source: IngestionSource,
  now: Date,
  call: CatalogCaller,
  fetchSource: (source: IngestionSource, now: Date) => Promise<FetchedSource>,
): Promise<SourceOutcome> {
  const slug = source.slug
  const idempotencyKey = ingestionKey(slug, now)
  let rejected = 0
  const plan = await planSourceRefresh({
    ingestion: true,
    source,
    fetchJobs: async () => {
      const fetched = await fetchSource(source, now)
      rejected = fetched.rejected
      return fetched
    },
  })

  if (plan.action === "skip") return { slug, outcome: "skipped", reason: plan.reason }

  if (plan.action === "failure") {
    // Recording a failure never touches postings, so current listings stay as they are.
    const payload = JSON.stringify({ sourceSlug: slug, idempotencyKey, error: plan.reason })
    const result = await call("record-source-failure", payload)
    if (result.error) return { slug, outcome: "error", reason: `record_failure_failed:${result.error.code ?? "unknown"}` }
    return { slug, outcome: "failed", reason: plan.reason, recorded: record(result.data).reason !== "duplicate" }
  }

  const truncated = plan.jobs.length > MAX_BATCH_POSTINGS
  const postings = plan.jobs.slice(0, MAX_BATCH_POSTINGS)
  // Only a complete, non-empty, untruncated snapshot may expire listings it does not contain.
  const completeSnapshot = plan.complete && !truncated && postings.length > 0
  const payload = JSON.stringify({ sourceSlug: slug, idempotencyKey, completeSnapshot, allowEmpty: false, postings })
  const result = await call("apply-catalog", payload)
  if (result.error) return { slug, outcome: "error", reason: `apply_failed:${result.error.code ?? "unknown"}` }
  const body = record(result.data)
  if (body.ok === true && body.reason === "duplicate") return { slug, outcome: "duplicate" }
  if (body.ok !== true) {
    return { slug, outcome: "skipped", reason: typeof body.reason === "string" ? body.reason : "apply_rejected" }
  }
  const upserted = count(body.upserted) ?? 0
  const inserted = count(body.inserted)
  return {
    slug,
    outcome: "applied",
    fetched: plan.jobs.length,
    inserted,
    updated: inserted == null ? null : upserted - inserted,
    expired: count(body.expired) ?? 0,
    rejected,
    completeSnapshot,
    truncated,
  }
}

/**
 * Refreshes every approved source once. Each source is isolated: a fetch or
 * database failure is reported for that source and the run continues.
 * The summary carries counts and reason codes only, never listing text or secrets.
 */
export async function runIngestion(input: {
  call: CatalogCaller
  now?: Date
  env?: Env
  fetchSource?: (source: IngestionSource, now: Date) => Promise<FetchedSource>
}): Promise<IngestionSummary> {
  const env = input.env ?? process.env
  const now = input.now ?? new Date()
  if (!jobIngestionEnabled(env)) return { status: "inactive", reason: "ingestion_disabled" }
  const fetchSource =
    input.fetchSource ?? ((source: IngestionSource, at: Date) => fetchSourcePages(source, at, { permitLiveFetch: true }))

  const listed = await input.call("list-ingestion-sources", JSON.stringify({ now: now.toISOString() }))
  if (listed.error) return { status: "error", reason: `list_failed:${listed.error.code ?? "unknown"}` }
  const rows = record(listed.data).sources
  const sources = (Array.isArray(rows) ? rows : []).map(parseSource).filter((row): row is IngestionSource => row !== null)

  const outcomes: SourceOutcome[] = []
  for (const source of sources) {
    try {
      outcomes.push(await ingestSource(source, now, input.call, fetchSource))
    } catch {
      outcomes.push({ slug: source.slug, outcome: "error", reason: "unexpected" })
    }
  }
  return { status: "completed", window: ingestionWindow(now), sources: outcomes }
}
