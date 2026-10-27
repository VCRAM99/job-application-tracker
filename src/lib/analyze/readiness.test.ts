import { describe, expect, it } from "vitest"

import { analysisBlockedReason } from "@/lib/analyze/readiness"

const ready = {
  AI_ACCOUNTING_SECRET: "a".repeat(32),
  AI_CREDENTIALS_KEY: Buffer.alloc(32, 1).toString("base64"),
}
const byok = { executionMode: "byok" as const, provider: "google" }

describe("analysis readiness", () => {
  it("names the first missing piece", () => {
    expect(analysisBlockedReason({ settings: null, hasByokKey: false, mockProvider: false }, ready)).toMatch(/Settings/)
    expect(analysisBlockedReason({ settings: byok, hasByokKey: true, mockProvider: false }, { ...ready, AI_ACCOUNTING_SECRET: "" })).toMatch(
      /AI_ACCOUNTING_SECRET/,
    )
    expect(analysisBlockedReason({ settings: byok, hasByokKey: true, mockProvider: false }, { ...ready, AI_CREDENTIALS_KEY: "short" })).toMatch(
      /AI_CREDENTIALS_KEY must be 32 bytes/,
    )
    expect(analysisBlockedReason({ settings: byok, hasByokKey: false, mockProvider: false }, ready)).toMatch(/Save a key/)
  })

  it("allows a run when configured, and with the mock provider", () => {
    expect(analysisBlockedReason({ settings: byok, hasByokKey: true, mockProvider: false }, ready)).toBeNull()
    expect(analysisBlockedReason({ settings: { executionMode: "managed", provider: "google" }, hasByokKey: false, mockProvider: false }, ready)).toBeNull()
    expect(analysisBlockedReason({ settings: byok, hasByokKey: false, mockProvider: true }, {})).toBeNull()
  })
})
