import { describe, expect, it } from "vitest"

import { loginSchema, resetPasswordSchema, signupSchema } from "@/lib/auth/schemas"

describe("auth schemas", () => {
  it("accepts a valid login", () => {
    expect(
      loginSchema.safeParse({ email: "ada@example.com", password: "secret" }).success,
    ).toBe(true)
  })

  it("rejects a short signup password and a mismatched confirmation", () => {
    const result = signupSchema.safeParse({
      email: "ada@example.com",
      password: "short1",
      confirmPassword: "short1",
    })
    expect(result.success).toBe(false)

    const mismatch = signupSchema.safeParse({
      email: "ada@example.com",
      password: "correcthorse1",
      confirmPassword: "correcthorse2",
    })
    expect(mismatch.success).toBe(false)
    if (!mismatch.success) {
      expect(mismatch.error.issues.some((issue) => issue.path[0] === "confirmPassword")).toBe(
        true,
      )
    }
  })

  it("requires a letter and a number on reset", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "password",
        confirmPassword: "password",
      }).success,
    ).toBe(false)
    expect(
      resetPasswordSchema.safeParse({
        password: "password1",
        confirmPassword: "password1",
      }).success,
    ).toBe(true)
  })
})
