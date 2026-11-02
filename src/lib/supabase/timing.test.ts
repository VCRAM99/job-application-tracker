import { describe, expect, it, vi } from "vitest"

import { perfTimingEnabled, timedFetch, timingOptions, timingPath } from "@/lib/supabase/timing"

describe("perf timing", () => {
  it("is off unless PERF_TIMING is exactly 1 outside Vercel", () => {
    expect(perfTimingEnabled({})).toBe(false)
    expect(perfTimingEnabled({ PERF_TIMING: "true" })).toBe(false)
    expect(perfTimingEnabled({ PERF_TIMING: "1" })).toBe(true)
    expect(perfTimingEnabled({ PERF_TIMING: "1", VERCEL_ENV: "production" })).toBe(false)
    expect(perfTimingEnabled({ PERF_TIMING: "1", VERCEL_ENV: "preview" })).toBe(false)
    expect(timingOptions({})).toEqual({})
    expect(timingOptions({ PERF_TIMING: "1" }).global?.fetch).toBeTypeOf("function")
  })

  it("logs the path only, never the query string", async () => {
    expect(timingPath("http://127.0.0.1:54321/rest/v1/applications?select=*&user_id=eq.abc&notes=ilike.secret")).toBe("/rest/v1/applications")
    const lines: string[] = []
    const base = vi.fn(async () => new Response("[]", { status: 200 }))
    const fetcher = timedFetch(base as unknown as typeof fetch, (line) => lines.push(line))
    await fetcher("http://127.0.0.1:54321/rest/v1/contacts?email=eq.dana%40example.com", { method: "get", headers: { authorization: "Bearer token-value" } })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^\[perf\] supabase GET \/rest\/v1\/contacts 200 \d+\.\dms$/)
    expect(lines[0]).not.toMatch(/dana|token-value|email/)
  })

  it("logs failures without the error text", async () => {
    const lines: string[] = []
    const fetcher = timedFetch((async () => {
      throw new Error("connect ECONNREFUSED user=ada")
    }) as unknown as typeof fetch, (line) => lines.push(line))
    await expect(fetcher("http://127.0.0.1:54321/auth/v1/user")).rejects.toThrow()
    expect(lines[0]).toMatch(/^\[perf\] supabase GET \/auth\/v1\/user error /)
    expect(lines[0]).not.toContain("ada")
  })
})
