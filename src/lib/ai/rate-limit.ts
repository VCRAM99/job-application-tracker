import "server-only"

import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Per-user AI request limits, in every execution mode (bring-your-own-key included). They count
 * the user's own ai_usage_events rows: every model call reserves one through the HMAC-gated
 * reserve_ai_usage function, so a request cannot reach a provider without being counted, and a
 * browser cannot add a reservation of its own. The database separately caps a user at one open
 * reservation and 200 rows a calendar month.
 */
export const AI_RATE_LIMITS = { perMinute: 6, perDay: 80 } as const

export type RateDecision = { ok: true } | { ok: false; window: "minute" | "day" }

export function rateDecision(counts: { minute: number; day: number }, limits = AI_RATE_LIMITS): RateDecision {
  if (counts.minute >= limits.perMinute) return { ok: false, window: "minute" }
  if (counts.day >= limits.perDay) return { ok: false, window: "day" }
  return { ok: true }
}

/** Counts this user's reservations in the last minute and day. A read failure allows the call (the database caps still apply). */
export async function checkAiRateLimit(supabase: Supabase, userId: string, now = new Date()): Promise<RateDecision> {
  const since = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const count = (from: string) =>
    supabase.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", from)
  const [minute, day] = await Promise.all([count(since(60_000)), count(since(86_400_000))])
  if (minute.error || day.error) return { ok: true }
  return rateDecision({ minute: minute.count ?? 0, day: day.count ?? 0 })
}
