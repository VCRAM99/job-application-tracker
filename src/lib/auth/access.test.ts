import { describe, expect, it } from "vitest"

import { isConfirmedAccount, isRecoveryProof, unconfirmedLoginMessage } from "@/lib/auth/access"

describe("isRecoveryProof", () => {
  it("accepts only a recovery token hash", () => {
    expect(isRecoveryProof("hash", "recovery")).toBe(true)
    expect(isRecoveryProof("", "recovery")).toBe(false)
    expect(isRecoveryProof("hash", "signup")).toBe(false)
    expect(isRecoveryProof("hash", "")).toBe(false)
  })
})

describe("isConfirmedAccount", () => {
  it("rejects missing and unconfirmed accounts", () => {
    expect(isConfirmedAccount(null)).toBe(false)
    expect(isConfirmedAccount({ email_confirmed_at: null })).toBe(false)
    expect(isConfirmedAccount({})).toBe(false)
  })

  it("accepts an account with a confirmation timestamp", () => {
    expect(isConfirmedAccount({ email_confirmed_at: "2026-10-18T00:00:00Z" })).toBe(true)
    expect(isConfirmedAccount({ confirmed_at: "2026-10-18T00:00:00Z" })).toBe(true)
  })

  it("blocks an unconfirmed password login before the session is kept", () => {
    expect(unconfirmedLoginMessage({ email_confirmed_at: null })).toMatch(/Confirm your email/)
    expect(unconfirmedLoginMessage({ email_confirmed_at: "2026-10-18T00:00:00Z" })).toBeNull()
  })
})
