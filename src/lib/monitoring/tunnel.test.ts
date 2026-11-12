// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/monitoring/route"
import { MAX_ENVELOPE_BYTES, parseDsn, readCapped, tunnelDecision } from "@/lib/monitoring/tunnel"

const DSN = "https://publickey123@o4500.ingest.us.sentry.io/4501"
const envelope = (dsn: string, body = '{"type":"event"}\n{"message":"x"}') => `${JSON.stringify({ dsn, sent_at: "2026-11-11T00:00:00Z" })}\n${body}`

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("Sentry tunnel decision", () => {
  it("parses DSNs and rejects malformed ones", () => {
    expect(parseDsn(DSN)).toEqual({ host: "o4500.ingest.us.sentry.io", projectId: "4501", publicKey: "publickey123" })
    for (const bad of [undefined, "", "not a url", "http://key@o1.ingest.sentry.io/1", "https://o1.ingest.sentry.io/1", "https://key@o1.ingest.sentry.io/abc"]) {
      expect(parseDsn(bad)).toBeNull()
    }
  })

  it("forwards only envelopes for the configured project", () => {
    expect(tunnelDecision(envelope(DSN), DSN)).toEqual({ ok: true, url: "https://o4500.ingest.us.sentry.io/api/4501/envelope/" })
    expect(tunnelDecision(envelope("https://publickey123@o4500.ingest.us.sentry.io/9999"), DSN)).toEqual({ ok: false, status: 403 })
    expect(tunnelDecision(envelope("https://publickey123@o666.ingest.us.sentry.io/4501"), DSN)).toEqual({ ok: false, status: 403 })
    expect(tunnelDecision(envelope("https://otherkey@o4500.ingest.us.sentry.io/4501"), DSN)).toEqual({ ok: false, status: 403 })
  })

  it("refuses malformed envelopes, oversized bodies, and requests when Sentry is off", () => {
    expect(tunnelDecision("not json\n{}", DSN)).toEqual({ ok: false, status: 400 })
    expect(tunnelDecision('{"sent_at":"x"}\n{}', DSN)).toEqual({ ok: false, status: 400 })
    expect(tunnelDecision(envelope(DSN, "x".repeat(MAX_ENVELOPE_BYTES)), DSN)).toEqual({ ok: false, status: 413 })
    expect(tunnelDecision(envelope(DSN), undefined)).toEqual({ ok: false, status: 404 })
    expect(tunnelDecision(envelope(DSN), "")).toEqual({ ok: false, status: 404 })
  })

  it("stops reading a body once it passes the cap", async () => {
    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(64 * 1024))
      },
    })
    expect(await readCapped(endless, 128 * 1024)).toBeNull()
    expect(pulled).toBeLessThan(10)
    expect(await readCapped(new Response("hello").body)).toBe("hello")
  })
})

describe("POST /monitoring", () => {
  const post = (body: string, headers: Record<string, string> = {}) => POST(new Request("http://localhost/monitoring", { method: "POST", body, headers }))

  it("relays a matching envelope to the configured project's ingest URL", async () => {
    vi.stubEnv("SENTRY_DSN", DSN)
    const upstream = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", upstream)
    const body = envelope(DSN)
    const response = await post(body)
    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledWith("https://o4500.ingest.us.sentry.io/api/4501/envelope/", expect.objectContaining({ method: "POST", body }))
  })

  it("never calls out for another DSN, an oversized body, or with Sentry off", async () => {
    const upstream = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", upstream)
    vi.stubEnv("SENTRY_DSN", DSN)
    expect((await post(envelope("https://attacker@o1.ingest.sentry.io/1"))).status).toBe(403)
    expect((await post("x", { "content-length": String(MAX_ENVELOPE_BYTES + 1) })).status).toBe(413)
    expect((await post(envelope(DSN, "y".repeat(MAX_ENVELOPE_BYTES + 10)))).status).toBe(413)
    vi.stubEnv("SENTRY_DSN", "")
    expect((await post(envelope(DSN))).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it("passes on Sentry's rate-limit headers so the SDK can back off", async () => {
    vi.stubEnv("SENTRY_DSN", DSN)
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429, headers: { "Retry-After": "60", "X-Sentry-Rate-Limits": "60:error:organization", "Set-Cookie": "x=1" } })))
    const response = await post(envelope(DSN))
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    expect(response.headers.get("x-sentry-rate-limits")).toBe("60:error:organization")
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("reports an upstream failure without details", async () => {
    vi.stubEnv("SENTRY_DSN", DSN)
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down")
    }))
    const response = await post(envelope(DSN))
    expect(response.status).toBe(502)
    expect(await response.text()).toBe("")
  })
})
