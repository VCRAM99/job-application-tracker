import { afterEach, describe, expect, it, vi } from "vitest"

import { enabledProviders, managedOffered, providerEnabled } from "@/lib/ai/flags"
import { completeWithProvider } from "@/lib/ai/providers"
import { AiRequestError } from "@/lib/ai/types"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("AI_PROVIDERS_ENABLED", () => {
  it("defaults to Gemini only on Vercel and every provider locally", () => {
    expect(enabledProviders({ VERCEL_ENV: "production" })).toEqual(["google"])
    expect(enabledProviders({ VERCEL_ENV: "preview" })).toEqual(["google"])
    expect(enabledProviders({})).toEqual(["openai", "anthropic", "google"])
  })

  it("reads a list, ignores unknown names, and falls back to Gemini", () => {
    expect(enabledProviders({ AI_PROVIDERS_ENABLED: "google, Anthropic" })).toEqual(["anthropic", "google"])
    expect(enabledProviders({ AI_PROVIDERS_ENABLED: "mistral" })).toEqual(["google"])
    expect(providerEnabled("openai", { AI_PROVIDERS_ENABLED: "google" })).toBe(false)
    expect(providerEnabled("google", { AI_PROVIDERS_ENABLED: "google" })).toBe(true)
  })

  it("refuses a disabled provider before any API call, even from a stale saved setting", async () => {
    vi.stubEnv("AI_PROVIDERS_ENABLED", "google")
    const create = vi.fn()
    const request = { apiKey: "sk-test", model: "gpt-5.4-mini", system: "s", user: "u", schemaName: "x", jsonSchema: {} }
    await expect(completeWithProvider("openai", request, { openai: { chat: { completions: { create } } } })).rejects.toMatchObject({ code: "provider_disabled" })
    await expect(completeWithProvider("anthropic", request)).rejects.toBeInstanceOf(AiRequestError)
    expect(create).not.toHaveBeenCalled()
  })
})

describe("Managed AI availability", () => {
  it("is offered only with the allowance on and a platform key for an enabled provider", () => {
    const allowance = { AI_MANAGED_ENABLED: "true", AI_MANAGED_MONTHLY_REQUEST_LIMIT: "10", AI_MANAGED_MONTHLY_TOKEN_LIMIT: "1000" }
    expect(managedOffered({})).toBe(false)
    expect(managedOffered(allowance)).toBe(false)
    expect(managedOffered({ ...allowance, AI_PLATFORM_OPENAI_API_KEY: "sk-x", AI_PROVIDERS_ENABLED: "google" })).toBe(false)
    expect(managedOffered({ ...allowance, AI_PLATFORM_GOOGLE_API_KEY: "g-x", AI_PROVIDERS_ENABLED: "google" })).toBe(true)
    expect(managedOffered({ AI_PLATFORM_GOOGLE_API_KEY: "g-x" })).toBe(false)
  })
})
