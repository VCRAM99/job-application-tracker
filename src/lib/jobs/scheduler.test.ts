import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { runScheduler } = vi.hoisted(() => ({
  runScheduler: vi.fn(async () => ({ status: 200, body: { status: "completed" } })),
}))
vi.mock("@/lib/jobs/run-scheduler", () => ({ runScheduler }))

import { GET, POST } from "@/app/api/jobs/scheduler/route"
import type { CatalogCaller } from "@/lib/jobs/catalog-rpc"
import type { IngestionSummary } from "@/lib/jobs/ingest"
import { authorizeScheduler, schedulerSecret } from "@/lib/jobs/scheduler-auth"

const SECRET = "c".repeat(40)

function request(method: "GET" | "POST", authorization?: string) {
  return new Request("http://localhost/api/jobs/scheduler", {
    method,
    headers: authorization ? { authorization } : {},
  })
}

describe("scheduler secret", () => {
  it("prefers CRON_SECRET, falls back to JOB_SCHEDULER_SECRET, and never accepts a short one", () => {
    expect(schedulerSecret({ CRON_SECRET: SECRET, JOB_SCHEDULER_SECRET: "j".repeat(40) })).toBe(SECRET)
    expect(schedulerSecret({ JOB_SCHEDULER_SECRET: "j".repeat(40) })).toBe("j".repeat(40))
    expect(schedulerSecret({ CRON_SECRET: "short", JOB_SCHEDULER_SECRET: "j".repeat(40) })).toBeNull()
    expect(schedulerSecret({ CRON_SECRET: "   " })).toBeNull()
    expect(schedulerSecret({})).toBeNull()
  })

  it("runs when either job flag is on and is off when both are", () => {
    const header = `Bearer ${SECRET}`
    expect(authorizeScheduler(header, { CRON_SECRET: SECRET })).toMatchObject({ status: 503, reason: "scheduler_disabled" })
    expect(authorizeScheduler(header, { CRON_SECRET: SECRET, JOB_INGESTION_ENABLED: "true" })).toEqual({ ok: true })
    expect(authorizeScheduler(header, { CRON_SECRET: SECRET, JOB_REFRESH_ENABLED: "true" })).toEqual({ ok: true })
  })
})

describe("scheduler route", () => {
  beforeEach(() => {
    runScheduler.mockClear()
    vi.stubEnv("JOB_REFRESH_ENABLED", "true")
    vi.stubEnv("JOB_SCHEDULER_SECRET", "")
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(["GET", "POST"] as const)("%s rejects a missing, short, or wrong secret and accepts the right one", async (method) => {
    const handler = method === "GET" ? GET : POST
    vi.stubEnv("CRON_SECRET", "")
    expect((await handler(request(method, `Bearer ${SECRET}`))).status).toBe(503)
    vi.stubEnv("CRON_SECRET", "too-short")
    expect((await handler(request(method, "Bearer too-short"))).status).toBe(503)
    vi.stubEnv("CRON_SECRET", SECRET)
    expect((await handler(request(method))).status).toBe(401)
    expect((await handler(request(method, `Bearer ${"x".repeat(40)}`))).status).toBe(401)
    expect((await handler(request(method, SECRET))).status).toBe(401)
    expect(runScheduler).not.toHaveBeenCalled()
    const ok = await handler(request(method, `Bearer ${SECRET}`))
    expect(ok.status).toBe(200)
    expect(runScheduler).toHaveBeenCalledTimes(1)
  })
})

describe("scheduler run order", async () => {
  const { runScheduler: realRun } = await vi.importActual<typeof import("@/lib/jobs/run-scheduler")>("@/lib/jobs/run-scheduler")
  const now = new Date("2026-10-28T11:00:00.000Z")
  const completed: IngestionSummary = { status: "completed", window: "2026-10-28T11", sources: [] }

  function deps() {
    const order: string[] = []
    return {
      order,
      deps: {
        caller: vi.fn(async () => (async () => ({ data: null, error: null })) as CatalogCaller),
        ingest: vi.fn(async () => {
          order.push("ingest")
          return completed
        }),
        alerts: vi.fn(async (): Promise<{ status: number; body: Record<string, unknown> }> => {
          order.push("alerts")
          return { status: 200, body: { status: "completed" } }
        }),
      },
    }
  }

  const writer = { JOB_CATALOG_WRITE_SECRET: "w".repeat(40) }

  it("runs ingestion alone when only JOB_INGESTION_ENABLED is set", async () => {
    const run = deps()
    const result = await realRun(now, { JOB_INGESTION_ENABLED: "true", ...writer }, run.deps)
    expect(run.order).toEqual(["ingest"])
    expect(result).toEqual({
      status: 200,
      body: {
        status: "completed",
        ingestion: { state: "ran", ok: true, result: completed },
        alerts: { state: "skipped", reason: "refresh_disabled" },
      },
    })
  })

  it("runs alerts only when refresh is enabled, after ingestion", async () => {
    const alertsOnly = deps()
    expect(await realRun(now, { JOB_REFRESH_ENABLED: "true" }, alertsOnly.deps)).toEqual({
      status: 200,
      body: {
        status: "completed",
        ingestion: { state: "skipped", reason: "ingestion_disabled" },
        alerts: { state: "ran", ok: true, result: { status: "completed" } },
      },
    })
    const both = deps()
    await realRun(now, { JOB_INGESTION_ENABLED: "true", JOB_REFRESH_ENABLED: "true", ...writer }, both.deps)
    expect(both.order).toEqual(["ingest", "alerts"])
    const neither = deps()
    expect((await realRun(now, {}, neither.deps)).body).toMatchObject({
      ingestion: { state: "skipped" },
      alerts: { state: "skipped" },
    })
    expect(neither.order).toEqual([])
  })

  it("still runs alerts and reports a failure when ingestion cannot run", async () => {
    const missing = deps()
    const result = await realRun(now, { JOB_INGESTION_ENABLED: "true", JOB_REFRESH_ENABLED: "true" }, missing.deps)
    expect(missing.order).toEqual(["alerts"])
    expect(result).toMatchObject({ status: 500, body: { ingestion: { state: "skipped", reason: "catalog_writer_unconfigured" } } })

    const throwing = deps()
    throwing.deps.ingest.mockRejectedValueOnce(new Error("boom"))
    const thrown = await realRun(now, { JOB_INGESTION_ENABLED: "true", JOB_REFRESH_ENABLED: "true", ...writer }, throwing.deps)
    expect(throwing.order).toEqual(["alerts"])
    expect(thrown).toMatchObject({
      status: 500,
      body: { ingestion: { state: "ran", ok: false, result: { status: "error", reason: "unexpected" } }, alerts: { state: "ran", ok: true } },
    })

    const alertFail = deps()
    alertFail.deps.alerts.mockResolvedValueOnce({ status: 500, body: { status: "error", reason: "collect_failed" } })
    expect(await realRun(now, { JOB_REFRESH_ENABLED: "true" }, alertFail.deps)).toMatchObject({
      status: 500,
      body: { alerts: { state: "ran", ok: false, result: { reason: "collect_failed" } } },
    })
  })
})
