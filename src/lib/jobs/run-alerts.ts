import "server-only"

import { planAlertRun } from "@/lib/jobs/alerts"
import { deliverJobAlertEmail } from "@/lib/jobs/email"
import { jobCatalogSecret, jobOperationProof } from "@/lib/jobs/proof"
import { jobRefreshEnabled } from "@/lib/jobs/flags"
import { mapAlertWorkspace } from "@/lib/jobs/workspace"
import { createClient } from "@/lib/supabase/server"

export async function runScheduledAlerts(now = new Date(), env: Record<string, string | undefined> = process.env) {
  if (!jobRefreshEnabled(env)) {
    return { status: 503, body: { status: "inactive", reason: "refresh_disabled" } }
  }
  const secret = jobCatalogSecret(env)
  if (!secret) {
    return { status: 503, body: { status: "inactive", reason: "catalog_writer_unconfigured" } }
  }
  const payload = JSON.stringify({ now: now.toISOString() })
  const supabase = await createClient()
  const collected = await supabase.rpc("collect_alert_workspace", {
    p_payload: payload,
    p_proof: jobOperationProof(secret, "collect-alerts", payload),
  })
  if (collected.error) {
    return { status: 500, body: { status: "error", reason: "collect_failed" } }
  }
  const workspace = mapAlertWorkspace(collected.data)
  const email = deliverJobAlertEmail(
    { to: "", subject: "Recommended jobs", text: "New listings match your alert." },
    env,
  )
  const plan = planAlertRun(workspace.users, workspace.postings, now, email.reason)
  const recordPayload = JSON.stringify({
    deliveries: plan.deliveries,
    successes: plan.successes,
    failures: plan.failures,
  })
  const recorded = await supabase.rpc("record_job_alerts", {
    p_payload: recordPayload,
    p_proof: jobOperationProof(secret, "record-alerts", recordPayload),
  })
  if (recorded.error) {
    return { status: 500, body: { status: "error", reason: "record_failed" } }
  }
  return {
    status: 200,
    body: {
      status: "completed",
      deliveries: plan.deliveries.length,
      successes: plan.successes.length,
      failures: plan.failures.length,
      truncated: workspace.truncated,
      email: email.reason,
    },
  }
}
