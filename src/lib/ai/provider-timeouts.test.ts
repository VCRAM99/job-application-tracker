// @vitest-environment node

import { describe, expect, it } from "vitest"

import { PROVIDER_TIMEOUT_MS } from "@/lib/ai/provider-error"
import { createAnthropicClient } from "@/lib/ai/providers/anthropic"
import { createGeminiClient } from "@/lib/ai/providers/google"
import { createOpenAIClient } from "@/lib/ai/providers/openai"

describe("provider clients", () => {
  it("time out every request instead of waiting on a hung connection", () => {
    expect(PROVIDER_TIMEOUT_MS).toBeLessThanOrEqual(90_000)
    expect(createOpenAIClient("sk-test").timeout).toBe(PROVIDER_TIMEOUT_MS)
    expect(createAnthropicClient("sk-ant-test").timeout).toBe(PROVIDER_TIMEOUT_MS)
    // The Gemini SDK sets no timeout by default; this reads the option the client was built with.
    const gemini = createGeminiClient("test") as unknown as { apiClient: { clientOptions: { httpOptions?: { timeout?: number } } } }
    expect(gemini.apiClient.clientOptions.httpOptions?.timeout).toBe(PROVIDER_TIMEOUT_MS)
  })
})
