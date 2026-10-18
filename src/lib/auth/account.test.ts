import { describe, expect, it } from "vitest"

import { mapAuthError } from "@/lib/auth/errors"
import { isDuplicateSignup } from "@/lib/auth/signup"

describe("mapAuthError", () => {
  it("explains unverified email, bad credentials, and duplicates", () => {
    expect(mapAuthError({ message: "Email not confirmed", code: "email_not_confirmed" })).toMatch(
      /Confirm your email/,
    )
    expect(mapAuthError({ message: "Invalid login credentials" })).toMatch(/incorrect/)
    expect(mapAuthError({ message: "User already registered", code: "user_already_exists" })).toMatch(
      /already exists/,
    )
  })

  it("explains expired links and rate limits", () => {
    expect(mapAuthError({ message: "Token has expired", code: "otp_expired" })).toMatch(/expired/)
    expect(mapAuthError({ message: "email rate limit exceeded", status: 429 })).toMatch(
      /Too many attempts/,
    )
  })
})

describe("isDuplicateSignup", () => {
  it("detects the empty-identities response used for existing emails", () => {
    expect(isDuplicateSignup({ identities: [] })).toBe(true)
    expect(isDuplicateSignup({ identities: [{ id: "1" }] })).toBe(false)
    expect(isDuplicateSignup(null)).toBe(false)
  })
})
