import { describe, expect, it } from "vitest"

import { accountingProof, accountingSecret } from "@/lib/ai/accounting"

describe("AI accounting proofs", () => {
  it("rejects a short secret and signs a stable canonical string", () => {
    expect(accountingSecret({})).toBeNull()
    expect(accountingSecret({ AI_ACCOUNTING_SECRET: "too-short" })).toBeNull()
    const secret = "job-tracker-test-accounting-secret-32"
    expect(accountingSecret({ AI_ACCOUNTING_SECRET: secret })).toBe(secret)
    const proof = accountingProof(secret, ["reserve", "user", "key", "byok", "openai", "gpt-5.4-mini"])
    expect(proof).toMatch(/^[a-f0-9]{64}$/)
    expect(accountingProof(secret, ["reserve", "user", "key", "managed", "openai", "gpt-5.4-mini"])).not.toBe(proof)
    expect(accountingProof(secret, ["finalize", "user", "event", null, 5])).toBe(
      accountingProof(secret, ["finalize", "user", "event", "", 5]),
    )
  })
})