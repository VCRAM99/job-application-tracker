import { afterEach, describe, expect, it, vi } from "vitest"

import { reportFailure } from "@/lib/monitoring/report"
import { scrubEvent, scrubText, sentryBaseOptions } from "@/lib/monitoring/scrub"

const capture = vi.hoisted(() => vi.fn())
vi.mock("@sentry/nextjs", () => ({ captureMessage: capture }))

afterEach(() => {
  vi.unstubAllEnvs()
  capture.mockReset()
})

describe("Sentry scrubbing", () => {
  it("drops request bodies, cookies, headers, query strings, users, breadcrumbs, and extras", () => {
    const event = scrubEvent({
      message: "Failed for ada@example.com with sk-abcdefghijklmnop",
      request: {
        url: "https://jobtracker.example/applications/123?q=secret+search",
        method: "POST",
        data: { resume: "Full resume text" },
        cookies: { "sb-access-token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signaturepart123" },
        headers: { authorization: "Bearer abc.def" },
        query_string: "q=secret",
      },
      user: { id: "u1", email: "ada@example.com", ip_address: "1.2.3.4" },
      breadcrumbs: [{ message: "typed a job description" }],
      extra: { jd: "Job description text" },
      contexts: { runtime: { name: "node" }, state: { draft: "Dear Dana" } },
      exception: {
        values: [
          {
            type: "Error",
            value: "Key AIzaSyA1234567890abcdefghij rejected for 5c8a88a5-ce9d-4d0d-a548-fd640726c32f",
            stacktrace: { frames: [{ filename: "app.js", lineno: 1, vars: { password: "x" }, context_line: "const key = 'sk-...'" }] },
          },
        ],
      },
    })
    const text = JSON.stringify(event)
    for (const leaked of ["ada@example.com", "sk-abcdefghijklmnop", "secret", "Full resume text", "eyJ", "Bearer abc", "Job description text", "Dear Dana", "AIzaSy", "5c8a88a5", "password", "1.2.3.4"]) {
      expect(text).not.toContain(leaked)
    }
    expect(event.request).toEqual({ method: "POST", url: "/applications/123" })
    expect(event.user).toBeUndefined()
    expect(event.breadcrumbs).toBeUndefined()
    expect(event.contexts).toEqual({ runtime: { name: "node" } })
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({ filename: "app.js", lineno: 1 })
  })

  it("drops spans and scrubs tag values", () => {
    const event = scrubEvent({
      spans: [{ description: "GET https://x.supabase.co/rest/v1/resumes?user_id=eq.5c8a88a5-ce9d-4d0d-a548-fd640726c32f" }],
      tags: { code: "provider_outage", note: "ada@example.com" },
    })
    expect(event.spans).toBeUndefined()
    expect(event.tags).toEqual({ code: "provider_outage", note: "[email]" })
  })

  it("cuts long messages", () => {
    expect(scrubText("x".repeat(500))!.length).toBeLessThanOrEqual(201)
  })

  it("uses conservative options with no PII and no breadcrumbs", () => {
    const options = sentryBaseOptions("https://key@o1.ingest.sentry.io/1")
    expect(options.sendDefaultPii).toBe(false)
    expect(options.tracesSampleRate).toBe(0)
    expect(options.beforeSendTransaction()).toBeNull()
    expect(options.maxBreadcrumbs).toBe(0)
    expect(options.beforeBreadcrumb()).toBeNull()
  })
})

describe("reportFailure", () => {
  it("sends nothing without SENTRY_DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "")
    await reportFailure("ai_provider_error", { code: "provider_outage" })
    expect(capture).not.toHaveBeenCalled()
  })

  it("sends codes as short tags with SENTRY_DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1")
    await reportFailure("ai_provider_error", { code: "provider_outage", provider: "google", model: "gemini-3.5-flash-lite", skipped: null })
    expect(capture).toHaveBeenCalledWith("ai_provider_error", { level: "error", tags: { code: "provider_outage", provider: "google", model: "gemini-3.5-flash-lite" } })
  })
})
