import { describe, expect, it, vi } from "vitest"

import { AI_RATE_LIMITS, checkAiRateLimit, rateDecision } from "@/lib/ai/rate-limit"
import { AI_ERROR_MESSAGES } from "@/lib/ai/types"

function supabaseWith(minute: number, day: number, error = false) {
  const calls: Array<{ user: string; from: string }> = []
  const query = (count: number) => ({
    eq: (_: string, user: string) => ({
      gte: async (_column: string, from: string) => {
        calls.push({ user, from })
        return error ? { count: null, error: { code: "x" } } : { count, error: null }
      },
    }),
  })
  let call = 0
  const supabase = { from: vi.fn(() => ({ select: vi.fn(() => query(call++ === 0 ? minute : day)) })) }
  return { supabase: supabase as never, calls }
}

describe("per-user AI rate limit", () => {
  it("allows under the limits and names the window it hits", () => {
    expect(rateDecision({ minute: AI_RATE_LIMITS.perMinute - 1, day: AI_RATE_LIMITS.perDay - 1 })).toEqual({ ok: true })
    expect(rateDecision({ minute: AI_RATE_LIMITS.perMinute, day: 0 })).toEqual({ ok: false, window: "minute" })
    expect(rateDecision({ minute: 0, day: AI_RATE_LIMITS.perDay })).toEqual({ ok: false, window: "day" })
  })

  it("counts only this user's reservations in the last minute and day", async () => {
    const now = new Date("2026-11-02T12:00:00Z")
    const { supabase, calls } = supabaseWith(AI_RATE_LIMITS.perMinute, 1)
    expect(await checkAiRateLimit(supabase, "user-1", now)).toEqual({ ok: false, window: "minute" })
    expect(calls).toEqual([
      { user: "user-1", from: "2026-11-02T11:59:00.000Z" },
      { user: "user-1", from: "2026-11-01T12:00:00.000Z" },
    ])
  })

  it("does not block when the count cannot be read (the database caps still apply)", async () => {
    const { supabase } = supabaseWith(0, 0, true)
    expect(await checkAiRateLimit(supabase, "user-1")).toEqual({ ok: true })
  })

  it("has a clear message", () => {
    expect(AI_ERROR_MESSAGES.ai_rate_limited).toMatch(/AI request limit/)
  })
})
