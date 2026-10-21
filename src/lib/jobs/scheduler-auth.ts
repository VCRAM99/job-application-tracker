import { timingSafeEqual } from "node:crypto"

import { jobRefreshEnabled } from "@/lib/jobs/flags"

export type SchedulerDecision =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: string }

export function authorizeScheduler(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
): SchedulerDecision {
  if (!jobRefreshEnabled(env)) {
    return { ok: false, status: 503, reason: "refresh_disabled" }
  }
  const secret = env.JOB_SCHEDULER_SECRET?.trim() ?? ""
  if (secret.length < 32) {
    return { ok: false, status: 503, reason: "scheduler_secret_missing" }
  }
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(authorization ?? "")
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, status: 401, reason: "unauthorized" }
  }
  return { ok: true }
}
