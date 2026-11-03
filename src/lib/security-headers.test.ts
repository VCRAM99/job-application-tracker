import { describe, expect, it } from "vitest"

import { contentSecurityPolicy, securityHeaders, supabaseConnectSources } from "@/lib/security-headers"

const HOSTED = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co" }

describe("security headers", () => {
  it("allows only the configured Supabase project, not every supabase.co host", () => {
    const csp = contentSecurityPolicy(HOSTED)
    expect(csp).toContain("connect-src 'self' https://abcdefghijklmnop.supabase.co wss://abcdefghijklmnop.supabase.co")
    expect(csp).not.toContain("*.supabase.co")
    expect(csp).toContain("upgrade-insecure-requests")
  })

  it("keeps local http builds working without upgrading requests", () => {
    const csp = contentSecurityPolicy({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })
    expect(csp).toContain("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321")
    expect(csp).not.toContain("upgrade-insecure-requests")
    expect(supabaseConnectSources({ NEXT_PUBLIC_SUPABASE_URL: "javascript:alert(1)" })).toEqual([])
    expect(supabaseConnectSources({})).toEqual([])
  })

  it("locks down frames, objects, forms, and base URIs", () => {
    const csp = contentSecurityPolicy(HOSTED)
    for (const directive of ["frame-ancestors 'none'", "frame-src 'none'", "object-src 'none'", "form-action 'self'", "base-uri 'self'", "default-src 'self'"]) {
      expect(csp).toContain(directive)
    }
  })

  it("sends CSP and HSTS only in production", () => {
    const keys = (headers: Array<{ key: string }>) => headers.map((header) => header.key)
    expect(keys(securityHeaders("production", HOSTED))).toEqual(expect.arrayContaining(["Content-Security-Policy", "Strict-Transport-Security", "Cross-Origin-Opener-Policy", "X-Frame-Options"]))
    expect(keys(securityHeaders("development", HOSTED))).not.toContain("Content-Security-Policy")
    expect(keys(securityHeaders("development", HOSTED))).not.toContain("Strict-Transport-Security")
  })
})
