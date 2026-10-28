import { timingSafeEqual } from "node:crypto"

import { jobIngestionEnabled, jobRefreshEnabled } from "@/lib/jobs/flags"

export type SchedulerDecision =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: string }

export const MIN_SCHEDULER_SECRET_LENGTH = 32

/**
 * CRON_SECRET is canonical because Vercel Cron sends it as the bearer token.
 * JOB_SCHEDULER_SECRET is used only when CRON_SECRET is unset. A set but short
 * CRON_SECRET does not fall back; it fails closed.
 */
export function schedulerSecret(env: Record<string, string | undefined> = process.env): string | null {
  const cron = env.CRON_SECRET?.trim() ?? ""
  const value = cron || (env.JOB_SCHEDULER_SECRET?.trim() ?? "")
  return value.length >= MIN_SCHEDULER_SECRET_LENGTH ? value : null
}

export function authorizeScheduler(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
): SchedulerDecision {
  if (!jobRefreshEnabled(env) && !jobIngestionEnabled(env)) {
    return { ok: false, status: 503, reason: "scheduler_disabled" }
  }
  const secret = schedulerSecret(env)
  if (!secret) {
    return { ok: false, status: 503, reason: "scheduler_secret_missing" }
  }
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(authorization ?? "")
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, status: 401, reason: "unauthorized" }
  }
  return { ok: true }
}
