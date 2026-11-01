import "server-only"

import { catalogCaller, type CatalogCaller } from "@/lib/jobs/catalog-rpc"
import { jobIngestionEnabled, jobRefreshEnabled } from "@/lib/jobs/flags"
import { runIngestion, type IngestionSummary } from "@/lib/jobs/ingest"
import { jobCatalogSecret } from "@/lib/jobs/proof"
import { runScheduledAlerts } from "@/lib/jobs/run-alerts"
import { createClient } from "@/lib/supabase/server"

type Env = Record<string, string | undefined>
type AlertResult = { status: number; body: Record<string, unknown> }

export type SchedulerDeps = {
  ingest: (call: CatalogCaller, now: Date, env: Env) => Promise<IngestionSummary>
  alerts: (now: Date, env: Env) => Promise<AlertResult>
  caller: (secret: string) => Promise<CatalogCaller>
}

const defaults: SchedulerDeps = {
  ingest: (call, now, env) => runIngestion({ call, now, env }),
  alerts: (now, env) => runScheduledAlerts(now, env),
  caller: async (secret) => catalogCaller(await createClient(), secret),
}

/**
 * Ingestion first, then alerts, so alerts see the refreshed catalog. Each step
 * runs only when its own flag is on. A repeated call in the same UTC hour is a
 * duplicate for ingestion and an upsert for alerts; a missed day is caught up
 * by the next full refresh.
 */
export type StageStatus =
  | { state: "ran"; ok: boolean; result: Record<string, unknown> }
  | { state: "skipped"; reason: string }

export async function runScheduler(
  now = new Date(),
  env: Env = process.env,
  deps: SchedulerDeps = defaults,
): Promise<{ status: number; body: { status: "completed" | "error"; ingestion: StageStatus; alerts: StageStatus } }> {
  let ingestion: StageStatus = { state: "skipped", reason: "ingestion_disabled" }
  if (jobIngestionEnabled(env)) {
    const secret = jobCatalogSecret(env)
    if (!secret) {
      ingestion = { state: "skipped", reason: "catalog_writer_unconfigured" }
    } else {
      const summary: IngestionSummary = await deps
        .ingest(await deps.caller(secret), now, env)
        .catch(() => ({ status: "error" as const, reason: "unexpected" }))
      ingestion = { state: "ran", ok: summary.status === "completed", result: summary }
    }
  }

  let alerts: StageStatus = { state: "skipped", reason: "refresh_disabled" }
  if (jobRefreshEnabled(env)) {
    const result: AlertResult = await deps
      .alerts(now, env)
      .catch(() => ({ status: 500, body: { status: "error", reason: "unexpected" } }))
    alerts = { state: "ran", ok: result.status < 400, result: result.body }
  }

  // A stage that was asked to run but could not is a failure, so the cron log shows it.
  const failed =
    (ingestion.state === "ran" && !ingestion.ok) ||
    (ingestion.state === "skipped" && ingestion.reason === "catalog_writer_unconfigured") ||
    (alerts.state === "ran" && !alerts.ok)
  return { status: failed ? 500 : 200, body: { status: failed ? "error" : "completed", ingestion, alerts } }
}
