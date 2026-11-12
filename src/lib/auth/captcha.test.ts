import { afterEach, describe, expect, it, vi } from "vitest"

import { captchaTokenFrom, TURNSTILE_RESPONSE_FIELD, turnstileSiteKey, validTurnstileSiteKey } from "@/lib/auth/captcha"
import { contentSecurityPolicy } from "@/lib/security-headers"

const createClient = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient }))
vi.mock("@/lib/env", () => ({ getSiteUrl: () => "http://localhost:3000" }))

// Cloudflare's published test site key (always passes).
const TEST_SITE_KEY = "1x00000000000000000000AA"
const HOSTED = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co" }

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function fakeAuth() {
  const auth = {
    signInWithPassword: vi.fn<(credentials: Record<string, unknown>) => Promise<unknown>>(async () => ({ data: { user: { email_confirmed_at: "2026-01-01T00:00:00Z", identities: [{ id: "1" }] } }, error: null })),
    signUp: vi.fn<(credentials: { options: { captchaToken?: string } }) => Promise<unknown>>(async () => ({ data: { user: { identities: [{ id: "1" }] }, session: null }, error: null })),
    resetPasswordForEmail: vi.fn<(email: string, options: { captchaToken?: string }) => Promise<unknown>>(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  }
  createClient.mockResolvedValue({ auth })
  return auth
}

afterEach(() => {
  createClient.mockReset()
  vi.unstubAllEnvs()
})

describe("Turnstile configuration", () => {
  it("accepts only a well-formed site key", () => {
    expect(validTurnstileSiteKey(TEST_SITE_KEY)).toBe(TEST_SITE_KEY)
    expect(validTurnstileSiteKey(`  ${TEST_SITE_KEY}  `)).toBe(TEST_SITE_KEY)
    for (const bad of [undefined, null, "", "short", "has spaces in the middle!", "<script>alert(1)</script>"]) {
      expect(validTurnstileSiteKey(bad)).toBeNull()
    }
    expect(turnstileSiteKey({})).toBeNull()
  })

  it("reads the token field and ignores missing or oversized values", () => {
    expect(captchaTokenFrom(form({ [TURNSTILE_RESPONSE_FIELD]: "token-123" }))).toBe("token-123")
    expect(captchaTokenFrom(form({}))).toBeUndefined()
    expect(captchaTokenFrom(form({ [TURNSTILE_RESPONSE_FIELD]: "  " }))).toBeUndefined()
    expect(captchaTokenFrom(form({ [TURNSTILE_RESPONSE_FIELD]: "x".repeat(5000) }))).toBeUndefined()
  })

  it("adds Turnstile to the CSP only when a valid key is set", () => {
    const off = contentSecurityPolicy(HOSTED)
    expect(off).toContain("script-src 'self' 'unsafe-inline';")
    expect(off).toContain("frame-src 'none'")
    expect(off).not.toContain("challenges.cloudflare.com")
    expect(contentSecurityPolicy({ ...HOSTED, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "not a key" })).toBe(off)

    const on = contentSecurityPolicy({ ...HOSTED, NEXT_PUBLIC_TURNSTILE_SITE_KEY: TEST_SITE_KEY })
    expect(on).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com;")
    expect(on).toContain("frame-src https://challenges.cloudflare.com;")
    expect(on).toContain("connect-src 'self' https://abcdefghijklmnop.supabase.co")
  })
})

describe("auth actions pass the Turnstile token to Supabase", () => {
  it("sends the token on sign-in, sign-up, and the reset request when the form has one", async () => {
    const { login, requestPasswordReset, signup } = await import("@/lib/auth/actions")
    const auth = fakeAuth()
    const token = { [TURNSTILE_RESPONSE_FIELD]: "token-123" }

    await login(form({ email: "ada@example.com", password: "Secret123", next: "/dashboard", ...token }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "ada@example.com", password: "Secret123", options: { captchaToken: "token-123" } })

    await signup(form({ email: "ada@example.com", password: "Secret123", confirmPassword: "Secret123", ...token }))
    expect(auth.signUp.mock.calls[0]![0]).toMatchObject({ options: { captchaToken: "token-123" } })

    await requestPasswordReset(form({ email: "ada@example.com", ...token }))
    expect(auth.resetPasswordForEmail.mock.calls[0]![1]).toMatchObject({ captchaToken: "token-123" })
  })

  it("calls Supabase exactly as before when there is no token (Turnstile off or not loaded)", async () => {
    const { login, requestPasswordReset, signup } = await import("@/lib/auth/actions")
    const auth = fakeAuth()

    await login(form({ email: "ada@example.com", password: "Secret123", next: "/dashboard" }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "ada@example.com", password: "Secret123" })

    await signup(form({ email: "ada@example.com", password: "Secret123", confirmPassword: "Secret123" }))
    expect(auth.signUp.mock.calls[0]![0].options.captchaToken).toBeUndefined()

    await requestPasswordReset(form({ email: "ada@example.com" }))
    expect(auth.resetPasswordForEmail.mock.calls[0]![1].captchaToken).toBeUndefined()
  })

  it("explains a failed check without leaking Supabase's wording", async () => {
    const { mapAuthError } = await import("@/lib/auth/errors")
    expect(mapAuthError({ message: "captcha protection: request disallowed (invalid-input-response)", code: "captcha_failed" })).toBe(
      "The security check did not pass. Wait for it to finish, then try again.",
    )
  })
})
