import { describe, expect, it } from "vitest"

import { assertSupportedModel } from "@/lib/ai/models"
import { completeAnthropic } from "@/lib/ai/providers/anthropic"
import { completeGemini } from "@/lib/ai/providers/google"
import { completeOpenAI } from "@/lib/ai/providers/openai"
import { AiRequestError, type StructuredRequest } from "@/lib/ai/types"

const request: StructuredRequest = {
  apiKey: "test-key",
  model: "gpt-5.4-mini",
  system: "system",
  user: "user",
  schemaName: "career_extraction",
  jsonSchema: { type: "object" },
}

const json = "{\"skills\":[]}"

describe("provider adapters", () => {
  it("normalizes a successful OpenAI response and missing usage", async () => {
    const result = await completeOpenAI(request, {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: json }, finish_reason: "stop" }],
          }),
        },
      },
    })
    expect(result.text).toBe(json)
    expect(result.inputTokens).toBeNull()
    expect(result.outputTokens).toBeNull()
  })

  it("maps OpenAI authentication, rate limit, and invalid output", async () => {
    await expect(
      completeOpenAI(request, {
        chat: { completions: { create: async () => ({ choices: [{ message: { content: "" } }] }) } },
      }),
    ).rejects.toMatchObject({ code: "invalid_response" })
    await expect(
      completeOpenAI(request, {
        chat: { completions: { create: async () => { throw Object.assign(new Error("no"), { status: 401 }) } } },
      }),
    ).rejects.toMatchObject({ code: "invalid_credentials", retryable: false })
    await expect(
      completeOpenAI(request, {
        chat: { completions: { create: async () => { throw Object.assign(new Error("slow"), { status: 429 }) } } },
      }),
    ).rejects.toMatchObject({ code: "rate_limited", retryable: true })
  })

  it("normalizes Anthropic usage and context limits", async () => {
    const result = await completeAnthropic(
      { ...request, model: "claude-haiku-4-5" },
      {
        messages: {
          create: async () => ({
            content: [{ type: "text", text: json }],
            stop_reason: "end_turn",
            usage: { input_tokens: 12, output_tokens: 4 },
          }),
        },
      },
    )
    expect(result).toMatchObject({ inputTokens: 12, outputTokens: 4, finishReason: "end_turn" })
    await expect(
      completeAnthropic(request, {
        messages: {
          create: async () => ({ content: [{ type: "text", text: json }], stop_reason: "max_tokens" }),
        },
      }),
    ).rejects.toMatchObject({ code: "context_limit" })
  })

  it("normalizes Gemini output and timeouts", async () => {
    const result = await completeGemini(
      { ...request, model: "gemini-2.5-flash" },
      {
        models: {
          generateContent: async () => ({
            text: json,
            usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 },
            candidates: [{ finishReason: "STOP" }],
          }),
        },
      },
    )
    expect(result.inputTokens).toBe(3)
    await expect(
      completeGemini(request, {
        models: { generateContent: async () => { throw new Error("request timed out") } },
      }),
    ).rejects.toMatchObject({ code: "transient", retryable: true })
  })

  it("rejects an unsupported model before a provider call", () => {
    expect(() => assertSupportedModel("openai", "gpt-obsolete")).toThrow(AiRequestError)
    expect(() => assertSupportedModel("google", "gpt-5.4-mini")).toThrow(AiRequestError)
  })
})
