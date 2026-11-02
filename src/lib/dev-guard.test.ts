// @vitest-environment node

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants"
import { afterEach, describe, expect, it, vi } from "vitest"

import config from "../../next.config"
import { devSupabaseGuardError, isLocalSupabaseUrl } from "@/lib/dev-guard"

const HOSTED = "https://abcdefghijklmnop.supabase.co"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("dev Supabase guard", () => {
  it("accepts only the local stack", () => {
    expect(isLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(true)
    expect(isLocalSupabaseUrl("http://localhost:54321/")).toBe(true)
    for (const value of [undefined, "", HOSTED, "https://127.0.0.1:54321", "http://127.0.0.1.example.com:54321", "http://localhost:54321/rest", "not a url"]) {
      expect(isLocalSupabaseUrl(value)).toBe(false)
    }
  })

  it("explains the refusal without echoing the URL, and honors the explicit override", () => {
    const error = devSupabaseGuardError({ NEXT_PUBLIC_SUPABASE_URL: HOSTED })
    expect(error).toMatch(/Refusing to start next dev/)
    expect(error).toContain("ALLOW_REMOTE_SUPABASE_IN_DEV=true")
    expect(error).not.toContain("abcdefghijklmnop")
    expect(devSupabaseGuardError({ NEXT_PUBLIC_SUPABASE_URL: HOSTED, ALLOW_REMOTE_SUPABASE_IN_DEV: "true" })).toBeNull()
    expect(devSupabaseGuardError({ NEXT_PUBLIC_SUPABASE_URL: HOSTED, ALLOW_REMOTE_SUPABASE_IN_DEV: "1" })).not.toBeNull()
    expect(devSupabaseGuardError({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBeNull()
  })

  it("stops next dev with a hosted URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOSTED)
    vi.stubEnv("ALLOW_REMOTE_SUPABASE_IN_DEV", "")
    expect(() => config(PHASE_DEVELOPMENT_SERVER)).toThrow(/Refusing to start next dev/)
  })

  it("never affects builds or production servers", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", HOSTED)
    vi.stubEnv("ALLOW_REMOTE_SUPABASE_IN_DEV", "")
    for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER]) {
      expect(config(phase).cacheComponents).toBe(true)
    }
  })
})
