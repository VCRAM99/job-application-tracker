import { describe, expect, it } from "vitest"

import { assertPublishableKey, getSiteUrl, parsePublicEnv, PRODUCTION_ORIGIN } from "@/lib/env"
import { securityHeaders } from "@/lib/security-headers"

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
    expect(getSiteUrl(parsePublicEnv(valid), "job-application-tracker.vercel.app", "preview")).toBe(
      "https://job-application-tracker.vercel.app",
    )
  })

  it("requires the production origin and rejects a site URL with a path", () => {
    const production = parsePublicEnv({
      ...valid,
      NEXT_PUBLIC_SITE_URL: PRODUCTION_ORIGIN,
    })
    expect(getSiteUrl(production, "job-application-tracker.vercel.app", "production")).toBe(
      PRODUCTION_ORIGIN,
    )
    expect(() => getSiteUrl(parsePublicEnv(valid), "job-application-tracker.vercel.app", "production")).toThrow(
      /jobtracker\.varunsr\.com/,
    )
    expect(() =>
      getSiteUrl(
        parsePublicEnv({ ...valid, NEXT_PUBLIC_SITE_URL: "https://jobtracker.varunsr.com/login" }),
        undefined,
        "preview",
      ),
    ).toThrow(/without a path/)
  })
})

describe("securityHeaders", () => {
  it("sets frame, content-type, and production content security policy headers", () => {
    const production = securityHeaders("production")
    expect(production.map((header) => header.key)).toEqual([
      "X-Content-Type-Options",
      "Referrer-Policy",
      "X-Frame-Options",
      "Permissions-Policy",
      "Content-Security-Policy",
    ])
    expect(production.find((header) => header.key === "X-Frame-Options")?.value).toBe("DENY")
    expect(production.find((header) => header.key === "Content-Security-Policy")?.value).toContain(
      "frame-ancestors 'none'",
    )
    expect(securityHeaders("development").some((header) => header.key === "Content-Security-Policy")).toBe(
      false,
    )
  })
})
