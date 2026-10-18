import { describe, expect, it } from "vitest"

import { assertPublishableKey, getSiteUrl, parsePublicEnv } from "@/lib/env"

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
}

describe("parsePublicEnv", () => {
  it("accepts the public project URL and publishable key", () => {
    expect(parsePublicEnv(valid).NEXT_PUBLIC_SUPABASE_URL).toBe(
      "https://example.supabase.co",
    )
  })

  it("rejects a missing URL and a secret key", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example" }),
    ).toThrow(/Invalid Supabase environment/)

    expect(() => assertPublishableKey("sb_secret_example")).toThrow(/secret/)
    expect(() =>
      parsePublicEnv({
        ...valid,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role.sig",
      }),
    ).toThrow(/secret/)
  })
})

describe("getSiteUrl", () => {
  it("prefers the configured site URL and strips a trailing slash", () => {
    const env = parsePublicEnv({
      ...valid,
      NEXT_PUBLIC_SITE_URL: "https://jobs.example.com/",
    })
    expect(getSiteUrl(env, "preview.vercel.app")).toBe("https://jobs.example.com")
  })

  it("uses the Vercel host when no site URL is set", () => {
    expect(getSiteUrl(parsePublicEnv(valid), "job-application-tracker.vercel.app")).toBe(
      "https://job-application-tracker.vercel.app",
    )
  })
})
