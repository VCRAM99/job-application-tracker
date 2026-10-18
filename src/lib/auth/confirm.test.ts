import { describe, expect, it } from "vitest"

import { decideConfirm } from "@/lib/auth/confirm"

describe("decideConfirm", () => {
  it("forwards recovery tokens without treating them as verified", () => {
    const decision = decideConfirm(
      new URLSearchParams("token_hash=abc&type=recovery&next=/reset-password"),
    )
    expect(decision).toEqual({ kind: "forward-recovery", tokenHash: "abc" })
  })

  it("verifies signup tokens and keeps a safe next path", () => {
    const decision = decideConfirm(
      new URLSearchParams("token_hash=abc&type=signup&next=/dashboard"),
    )
    expect(decision).toEqual({
      kind: "verify-email",
      tokenHash: "abc",
      type: "signup",
      next: "/dashboard",
    })
  })

  it("rejects an off-site next path", () => {
    const decision = decideConfirm(
      new URLSearchParams("token_hash=abc&type=email&next=https://evil.example"),
    )
    expect(decision).toMatchObject({ kind: "verify-email", next: "/dashboard" })
  })

  it("treats provider errors and unknown links as expired", () => {
    expect(
      decideConfirm(new URLSearchParams("error=access_denied&error_code=otp_expired")),
    ).toEqual({ kind: "expired" })
    expect(decideConfirm(new URLSearchParams())).toEqual({ kind: "expired" })
  })

  it("does not treat a signup token as password recovery", () => {
    const decision = decideConfirm(
      new URLSearchParams("token_hash=abc&type=signup&next=/reset-password"),
    )
    expect(decision.kind).toBe("verify-email")
  })

  it("exchanges a PKCE code when no token hash is present", () => {
    expect(decideConfirm(new URLSearchParams("code=auth-code&next=/reset-password"))).toEqual({
      kind: "exchange-code",
      code: "auth-code",
      next: "/reset-password",
    })
  })
})
