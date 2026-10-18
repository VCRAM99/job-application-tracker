import { describe, expect, it } from "vitest"

import { NAV_ITEMS } from "@/lib/navigation"
import {
  isProtectedPath,
  isPublicPath,
  safeNextPath,
  sessionGate,
} from "@/lib/auth/paths"

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/companies")).toBe("/companies")
    expect(safeNextPath("/applications?status=open")).toBe("/applications?status=open")
  })

  it("falls back for off-site values", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard")
    expect(safeNextPath("//evil.example")).toBe("/dashboard")
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard")
    expect(safeNextPath("/%2F%2Fevil.example")).toBe("/dashboard")
    expect(safeNextPath(null)).toBe("/dashboard")
  })
})

describe("sessionGate", () => {
  it("sends anonymous visitors from protected routes to login", () => {
    const gate = sessionGate("/companies", new URLSearchParams(), false)
    expect(gate).toEqual({
      type: "redirect",
      pathname: "/login",
      search: "?next=%2Fcompanies",
    })
  })

  it("lets an authenticated visitor stay on a protected route", () => {
    expect(sessionGate("/tasks", new URLSearchParams(), true)).toEqual({
      type: "continue",
    })
  })

  it("sends an authenticated visitor away from guest pages", () => {
    const gate = sessionGate(
      "/login",
      new URLSearchParams("next=/settings"),
      true,
    )
    expect(gate).toEqual({
      type: "redirect",
      pathname: "/settings",
      search: "",
    })
  })

  it("does not treat a signed-in session as a password reset", () => {
    expect(sessionGate("/reset-password", new URLSearchParams(), true)).toEqual({
      type: "continue",
    })
  })

  it("keeps the reset page available without a session", () => {
    expect(sessionGate("/reset-password", new URLSearchParams("type=signup"), false)).toEqual({
      type: "continue",
    })
  })

  it("leaves the email confirmation callback alone", () => {
    expect(sessionGate("/auth/confirm", new URLSearchParams("token_hash=abc"), false)).toEqual({
      type: "continue",
    })
  })

  it("keeps every navigation target behind the session check", () => {
    for (const item of NAV_ITEMS) {
      expect(isProtectedPath(item.href)).toBe(true)
      expect(isPublicPath(item.href)).toBe(false)
    }
  })
})
