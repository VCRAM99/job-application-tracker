import { describe, expect, it } from "vitest"

import { decryptSecret, encryptSecret, lastFour, parseKeyRing, sha256 } from "@/lib/ai/crypto"
import { AiRequestError } from "@/lib/ai/types"

const KEY = Buffer.alloc(32, 7).toString("base64")

describe("credential encryption", () => {
  it("round-trips a key and keeps the plaintext out of the ciphertext", () => {
    const ring = parseKeyRing({ AI_CREDENTIALS_KEY: KEY, AI_CREDENTIALS_KEY_VERSION: "1" })
    expect(ring).not.toBeNull()
    const secret = "sk-test-key-not-a-real-provider-secret"
    const encrypted = encryptSecret(secret, ring!)
    expect(encrypted.ciphertext).not.toContain(secret)
    expect(encrypted.nonce).not.toBe(encrypted.authTag)
    expect(decryptSecret(encrypted, ring!)).toBe(secret)
    expect(lastFour(secret)).toBe("cret")
  })

  it("rejects a different key and a short secret", () => {
    const ring = parseKeyRing({ AI_CREDENTIALS_KEY: KEY })!
    const other = parseKeyRing({
      AI_CREDENTIALS_KEY: Buffer.alloc(32, 9).toString("base64"),
    })!
    const encrypted = encryptSecret("sk-ant-test-key-value-0001", ring)
    expect(() => decryptSecret(encrypted, other)).toThrow(AiRequestError)
    expect(() => lastFour("short")).toThrow(AiRequestError)
  })

  it("requires a 32-byte server key and ignores a missing key", () => {
    expect(parseKeyRing({})).toBeNull()
    expect(() => parseKeyRing({ AI_CREDENTIALS_KEY: "too-short" })).toThrow(AiRequestError)
    expect(sha256("same")).toBe(sha256("same"))
  })
})
