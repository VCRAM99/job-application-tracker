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
export async function runScheduler(
  now = new Date(),
  env: Env = process.env,
  deps: SchedulerDeps = defaults,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let ingestion: IngestionSummary | { status: "skipped"; reason: string } = { status: "skipped", reason: "ingestion_disabled" }
  if (jobIngestionEnabled(env)) {
    const secret = jobCatalogSecret(env)
    ingestion = secret
      ? await deps.ingest(await deps.caller(secret), now, env).catch(() => ({ status: "error" as const, reason: "unexpected" }))
      : { status: "inactive", reason: "catalog_writer_unconfigured" }
  }
  const alerts: AlertResult = jobRefreshEnabled(env)
    ? await deps.alerts(now, env).catch(() => ({ status: 500, body: { status: "error", reason: "unexpected" } }))
    : { status: 200, body: { status: "skipped", reason: "refresh_disabled" } }

  const failed = ingestion.status === "error" || ingestion.status === "inactive" || alerts.status >= 500
  return { status: failed ? 500 : 200, body: { status: failed ? "error" : "completed", ingestion, alerts: alerts.body } }
}
