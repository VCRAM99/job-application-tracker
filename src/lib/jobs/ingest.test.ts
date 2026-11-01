import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it, vi } from "vitest"

import type { CatalogCaller, CatalogRpcResult } from "@/lib/jobs/catalog-rpc"
import {
  fetchSourcePages,
  ingestionKey,
  chunkPostings,
  MAX_CHUNK_CHARS,
  MAX_SNAPSHOT_POSTINGS,
  runIngestion,
  type FetchedSource,
  type IngestionSource,
} from "@/lib/jobs/ingest"
import type { NormalizedJob } from "@/lib/jobs/normalize"
import type { JobOperation } from "@/lib/jobs/proof"

const now = new Date("2026-10-28T11:05:00.000Z")
const env = { JOB_INGESTION_ENABLED: "true" }
const greenhouseFixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/lib/jobs/sources/fixtures/greenhouse.json"), "utf8"),
) as unknown

function source(slug: string, overrides: Partial<IngestionSource> = {}): IngestionSource {
  return {
    slug,
    provider: "greenhouse",
    sourceIdentifier: slug.replace(/[^a-z0-9]/g, ""),
    region: "global",
    employerName: "Northwind",
    employerDomain: "northwind.example",
    accessMethod: "documented_https_json",
    approvedUsage: "Store normalized public posting fields.",
    attributionRequirements: "Name Greenhouse.",
    retentionRestrictions: "Expire omitted listings.",
    allowedStorageFields: ["title"],
    refreshLimitPerDay: 4,
    approvalStatus: "approved",
    termsStatus: "permitted",
    liveIngestionEnabled: true,
    ...overrides,
  }
}

function job(id: string): NormalizedJob {
  return {
    sourceJobId: id,
    employerName: "Northwind",
    employerDomain: "northwind.example",
    title: `Role ${id}`,
    locationText: null,
    countryCode: null,
    region: null,
    workArrangement: "unknown",
    employmentType: "unknown",
    seniority: "unknown",
    compensationMin: null,
    compensationMax: null,
    currency: null,
    salaryPeriod: "unknown",
    postedAt: null,
    listingUrl: `https://boards.greenhouse.io/northwind/jobs/${id}`,
    applicationUrl: null,
    applicationMethod: "ats",
    requisitionId: null,
    descriptionText: "Confidential listing body text",
    skills: [],
    titleTokens: [],
    skillTokens: [],
    contentHash: "a".repeat(64),
    listingStatus: "active",
    provenance: {},
  }
}

type Call = { operation: JobOperation; payload: Record<string, unknown> }

function fakeCatalog(
  sources: IngestionSource[],
  respond: (call: Call) => CatalogRpcResult = (call) =>
    call.operation === "apply-catalog"
      ? { data: { ok: true, upserted: (call.payload.postings as unknown[]).length, inserted: 1, expired: 0 }, error: null }
      : { data: { ok: true, activeUnchanged: 3 }, error: null },
) {
  const calls: Call[] = []
  const call: CatalogCaller = async (operation, payload) => {
    const parsed = { operation, payload: JSON.parse(payload) as Record<string, unknown> }
    calls.push(parsed)
    if (operation === "list-ingestion-sources") return { data: { ok: true, sources }, error: null }
    return respond(parsed)
  }
  return { call, calls }
}

const fetched = (jobs: NormalizedJob[], complete = true): FetchedSource => ({ jobs, complete, rejected: 0 })

describe("ingestion runner", () => {
  it("does nothing while ingestion is off", async () => {
    const catalog = fakeCatalog([source("greenhouse:a")])
    await expect(runIngestion({ call: catalog.call, now, env: {} })).resolves.toEqual({
      status: "inactive",
      reason: "ingestion_disabled",
    })
    expect(catalog.calls).toEqual([])
  })

  it("isolates each source and keeps going after a fetch failure or a database error", async () => {
    const catalog = fakeCatalog(
      [
        source("greenhouse:down"),
        source("greenhouse:ok"),
        source("greenhouse:paused", { liveIngestionEnabled: false }),
        source("greenhouse:dberror"),
        source("greenhouse:boom"),
      ],
      (call) => {
        if (call.payload.sourceSlug === "greenhouse:dberror") return { data: null, error: { message: "x", code: "57014" } }
        if (call.operation === "apply-catalog") return { data: { ok: true, upserted: 2, inserted: 1, expired: 0 }, error: null }
        return { data: { ok: true, activeUnchanged: 5 }, error: null }
      },
    )
    const fetchSource = vi.fn(async (item: IngestionSource) => {
      if (item.slug === "greenhouse:down") throw new Error("http_status")
      if (item.slug === "greenhouse:boom") throw "not an error object"
      return fetched([job("1"), job("2")])
    })
    const summary = await runIngestion({ call: catalog.call, now, env, fetchSource })
    expect(summary).toEqual({
      status: "completed",
      window: "2026-10-28T11",
      sources: [
        { slug: "greenhouse:down", outcome: "failed", reason: "http_status", recorded: true },
        {
          slug: "greenhouse:ok",
          outcome: "applied",
          fetched: 2,
          inserted: 1,
          updated: 1,
          expired: 0,
          rejected: 0,
          completeSnapshot: true,
          truncated: false,
          chunks: 1,
        },
        { slug: "greenhouse:paused", outcome: "skipped", reason: "source_not_activated" },
        { slug: "greenhouse:dberror", outcome: "error", reason: "apply_failed:57014" },
        { slug: "greenhouse:boom", outcome: "failed", reason: "source_request_failed", recorded: true },
      ],
    })
    expect(fetchSource).toHaveBeenCalledTimes(4)
  })

  it("records a failed fetch without sending an apply that could expire listings", async () => {
    const catalog = fakeCatalog([source("greenhouse:down")])
    await runIngestion({
      call: catalog.call,
      now,
      env,
      fetchSource: async () => {
        throw new Error("timeout")
      },
    })
    expect(catalog.calls.map((call) => call.operation)).toEqual(["list-ingestion-sources", "record-source-failure"])
    expect(catalog.calls[1]?.payload).toEqual({
      sourceSlug: "greenhouse:down",
      idempotencyKey: "greenhouse:down:2026-10-28T11",
      error: "timeout",
    })
  })

  it("reports a source the database no longer treats as live without counting it as recorded", async () => {
    const catalog = fakeCatalog([source("greenhouse:revoked")], () => ({ data: { ok: false, reason: "source_not_live" }, error: null }))
    const failing = await runIngestion({ call: catalog.call, now, env, fetchSource: async () => { throw new Error("timeout") } })
    expect(failing).toMatchObject({ sources: [{ slug: "greenhouse:revoked", outcome: "skipped", reason: "source_not_live" }] })
    const applying = await runIngestion({ call: catalog.call, now, env, fetchSource: async () => fetched([job("1")]) })
    expect(applying).toMatchObject({ sources: [{ slug: "greenhouse:revoked", outcome: "skipped", reason: "source_not_live" }] })
  })

  it("never asks to expire listings from an empty, partial, or truncated snapshot", async () => {
    const run = async (result: FetchedSource) => {
      const catalog = fakeCatalog([source("greenhouse:a")])
      await runIngestion({ call: catalog.call, now, env, fetchSource: async () => result })
      return catalog.calls.find((call) => call.operation === "apply-catalog")?.payload
    }
    expect(await run(fetched([]))).toMatchObject({ completeSnapshot: false, allowEmpty: false, postings: [] })
    expect(await run(fetched([job("1")], false))).toMatchObject({ completeSnapshot: false })
    const catalog = fakeCatalog([source("greenhouse:a")])
    const many = Array.from({ length: MAX_SNAPSHOT_POSTINGS + 5 }, (_, index) => job(String(index)))
    const summary = await runIngestion({ call: catalog.call, now, env, fetchSource: async () => fetched(many) })
    const applies = catalog.calls.filter((call) => call.operation === "apply-catalog").map((call) => call.payload)
    expect(applies.flatMap((payload) => payload.postings as unknown[])).toHaveLength(MAX_SNAPSHOT_POSTINGS)
    expect(applies.every((payload) => payload.completeSnapshot === false)).toBe(true)
    expect(summary).toMatchObject({ sources: [{ truncated: true, completeSnapshot: false }] })
    expect(await run(fetched([job("1")]))).toMatchObject({ completeSnapshot: true, allowEmpty: false })
  })

  describe("chunked snapshots", () => {
    const big = (id: string) => ({ ...job(id), descriptionText: "d".repeat(7_000) })
    const bigJobs = Array.from({ length: 250 }, (_, index) => big(String(index)))

    it("keeps every chunk under the size budget and sends chunks in order with one final chunk", async () => {
      const chunks = chunkPostings(bigJobs)
      expect(chunks.length).toBeGreaterThan(1)
      for (const chunk of chunks) expect(JSON.stringify({ postings: chunk }).length).toBeLessThan(MAX_CHUNK_CHARS)
      expect(chunks.flat()).toHaveLength(250)

      const catalog = fakeCatalog([source("greenhouse:big")], (call) => ({
        data: { ok: true, upserted: (call.payload.postings as unknown[]).length, inserted: 0, expired: call.payload.finalChunk ? 3 : 0 },
        error: null,
      }))
      const summary = await runIngestion({ call: catalog.call, now, env, fetchSource: async () => fetched(bigJobs) })
      const applies = catalog.calls.filter((call) => call.operation === "apply-catalog").map((call) => call.payload)
      expect(applies.map((payload) => [payload.chunkIndex, payload.finalChunk, payload.idempotencyKey, payload.snapshotKey])).toEqual(
        chunks.map((_, index) => [
          index,
          index === chunks.length - 1,
          `greenhouse:big:2026-10-28T11:c${index}`,
          "greenhouse:big:2026-10-28T11",
        ]),
      )
      expect(summary).toMatchObject({
        sources: [{ outcome: "applied", fetched: 250, inserted: 0, updated: 250, expired: 3, chunks: chunks.length }],
      })
    })

    it("stops at a failed middle chunk so the final chunk never runs", async () => {
      const catalog = fakeCatalog([source("greenhouse:big")], (call) =>
        call.payload.chunkIndex === 1
          ? { data: null, error: { message: "timeout", code: "57014" } }
          : { data: { ok: true, upserted: 1, inserted: 1, expired: 0 }, error: null },
      )
      const summary = await runIngestion({ call: catalog.call, now, env, fetchSource: async () => fetched(bigJobs) })
      const sent = catalog.calls.filter((call) => call.operation === "apply-catalog").map((call) => call.payload.chunkIndex)
      expect(sent).toEqual([0, 1])
      expect(summary).toMatchObject({ sources: [{ outcome: "error", reason: "apply_failed:57014:chunk1" }] })
    })

    it("reports a rerun of an applied snapshot as a duplicate and trims long descriptions", async () => {
      const catalog = fakeCatalog([source("greenhouse:big")], () => ({ data: { ok: true, reason: "duplicate" }, error: null }))
      const summary = await runIngestion({ call: catalog.call, now, env, fetchSource: async () => fetched(bigJobs) })
      expect(summary).toMatchObject({ sources: [{ outcome: "duplicate" }] })

      const long = fakeCatalog([source("greenhouse:a")])
      await runIngestion({ call: long.call, now, env, fetchSource: async () => fetched([{ ...job("1"), descriptionText: "x".repeat(20_000) }]) })
      const sent = long.calls.find((call) => call.operation === "apply-catalog")?.payload.postings as Array<{ descriptionText: string }>
      expect(sent[0]?.descriptionText).toHaveLength(8_000)
    })
  })

  it("uses one idempotency key per source and UTC hour", async () => {
    expect(ingestionKey("greenhouse:a", now)).toBe("greenhouse:a:2026-10-28T11")
    expect(ingestionKey("greenhouse:a", new Date("2026-10-28T11:59:59.999Z"))).toBe("greenhouse:a:2026-10-28T11")
    expect(ingestionKey("greenhouse:a", new Date("2026-10-28T12:00:00.000Z"))).toBe("greenhouse:a:2026-10-28T12")
    const catalog = fakeCatalog([source("greenhouse:a")])
    await runIngestion({ call: catalog.call, now, env, fetchSource: async () => fetched([job("1")]) })
    expect(catalog.calls[1]?.payload.idempotencyKey).toBe("greenhouse:a:2026-10-28T11")
  })

  it.each([
    [{ ok: true, reason: "duplicate" }, { outcome: "duplicate" }],
    [{ ok: false, reason: "lock_held" }, { outcome: "skipped", reason: "lock_held" }],
    [{ ok: false, reason: "rate_limited" }, { outcome: "skipped", reason: "rate_limited" }],
    [{ ok: false, reason: "refresh_limit_unset" }, { outcome: "skipped", reason: "refresh_limit_unset" }],
  ])("reports the database answer %j without retrying", async (data, expected) => {
    const catalog = fakeCatalog([source("greenhouse:a")], () => ({ data, error: null }))
    const summary = await runIngestion({ call: catalog.call, now, env, fetchSource: async () => fetched([job("1")]) })
    expect(summary).toMatchObject({ status: "completed", sources: [{ slug: "greenhouse:a", ...expected }] })
    expect(catalog.calls.filter((call) => call.operation === "apply-catalog")).toHaveLength(1)
  })

  it("stops before fetching when the source list cannot be read, and leaks no listing text", async () => {
    const fetchSource = vi.fn()
    const failing: CatalogCaller = async () => ({ data: null, error: { message: "stale request", code: "42501" } })
    await expect(runIngestion({ call: failing, now, env, fetchSource })).resolves.toEqual({
      status: "error",
      reason: "list_failed:42501",
    })
    expect(fetchSource).not.toHaveBeenCalled()

    const catalog = fakeCatalog([source("greenhouse:a")])
    const summary = await runIngestion({ call: catalog.call, now, env, fetchSource: async () => fetched([job("1")]) })
    expect(JSON.stringify(summary)).not.toContain("Confidential listing body text")
  })

  it("fetches a fixture board through the adapter without live HTTP", async () => {
    const load = vi.fn(async () => greenhouseFixture)
    const page = await fetchSourcePages(source("greenhouse:northwind"), now, { load, permitLiveFetch: false })
    expect(page.jobs.map((item) => item.title)).toEqual(["Senior Backend Engineer", "Account Executive"])
    expect(page).toMatchObject({ complete: true, rejected: 1 })
    await expect(
      fetchSourcePages(source("greenhouse:northwind"), now, { permitLiveFetch: false }),
    ).rejects.toThrow(/live_fetch_not_permitted/)
    await expect(
      fetchSourcePages(source("greenhouse:bad", { sourceIdentifier: "bad id" }), now, { load, permitLiveFetch: false }),
    ).rejects.toThrow(/invalid_source_config/)
  })
})
