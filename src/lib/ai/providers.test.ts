import { describe, expect, it } from "vitest"

import { assertSupportedModel, modelsFor } from "@/lib/ai/models"
import { mapProviderFailure } from "@/lib/ai/provider-error"
import { completeAnthropic } from "@/lib/ai/providers/anthropic"
import { completeGemini } from "@/lib/ai/providers/google"
import { completeOpenAI } from "@/lib/ai/providers/openai"
import { AI_ERROR_MESSAGES, AiRequestError, type StructuredRequest } from "@/lib/ai/types"

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

  it("sends a low Gemini thinking level only when asked and supported", async () => {
    const configs: Array<Record<string, unknown>> = []
    const client = {
      models: {
        generateContent: async (args: { config: Record<string, unknown> }) => {
          configs.push(args.config)
          return { text: json, candidates: [{ finishReason: "STOP" }] }
        },
      },
    }
    await completeGemini({ ...request, model: "gemini-3.8-flash", thinking: "low" }, client)
    await completeGemini({ ...request, model: "gemini-3.8-flash" }, client)
    await completeGemini({ ...request, model: "gemini-2.5-flash", thinking: "low" }, client)
    expect(configs[0]?.thinkingConfig).toEqual({ thinkingLevel: "LOW" })
    expect(configs[1]).not.toHaveProperty("thinkingConfig")
    expect(configs[2]).not.toHaveProperty("thinkingConfig")
  })

  it("reports a retired or unknown model as model unavailable for every provider", async () => {
    const notFound = Object.assign(
      new Error("models/gemini-2.5-flash is no longer available to new users. Please use gemini-3.8-flash."),
      { status: 404 },
    )
    const unavailable = { code: "model_unavailable", retryable: false, message: AI_ERROR_MESSAGES.model_unavailable }
    await expect(
      completeOpenAI(request, { chat: { completions: { create: async () => { throw notFound } } } }),
    ).rejects.toMatchObject(unavailable)
    await expect(
      completeAnthropic({ ...request, model: "claude-haiku-5-5" }, { messages: { create: async () => { throw notFound } } }),
    ).rejects.toMatchObject(unavailable)
    await expect(
      completeGemini({ ...request, model: "gemini-2.5-flash" }, { models: { generateContent: async () => { throw notFound } } }),
    ).rejects.toMatchObject(unavailable)
    // Some SDK errors carry no status; the provider's own wording still maps.
    expect(mapProviderFailure(new Error("The model `gpt-9` does not exist or you do not have access to it.")).code).toBe(
      "model_unavailable",
    )
    expect(mapProviderFailure(Object.assign(new Error("Internal error"), { status: 500 })).code).toBe("provider_outage")
  })

  it("drops maxItems from the Gemini schema only for Flash-Lite", async () => {
    const schemas: unknown[] = []
    const client = {
      models: {
        generateContent: async (args: { config: { responseJsonSchema: unknown } }) => {
          schemas.push(args.config.responseJsonSchema)
          return { text: json, candidates: [{ finishReason: "STOP" }] }
        },
      },
    }
    const jsonSchema = { type: "object", properties: { items: { type: "array", maxItems: 60, items: { type: "string" } } } }
    await completeGemini({ ...request, model: "gemini-3.5-flash-lite", jsonSchema }, client)
    await completeGemini({ ...request, model: "gemini-3.8-flash", jsonSchema }, client)
    expect(JSON.stringify(schemas[0])).not.toContain("maxItems")
    expect(schemas[1]).toEqual(jsonSchema)
  })

  it("does not tell the user to retry a request the provider rejected as invalid", () => {
    const invalid = Object.assign(new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT"}}'), { status: 400 })
    expect(mapProviderFailure(invalid)).toMatchObject({ code: "unsupported_model", retryable: false })
  })

  it("lists the current default models in the registry", () => {
    expect(assertSupportedModel("google", "gemini-3.8-flash").thinkingLevel).toBe(true)
    expect(assertSupportedModel("anthropic", "claude-haiku-5-5").label).toBe("Claude Haiku 5.5")
    expect(modelsFor("google")[0]?.id).toBe("gemini-3.8-flash")
  })

  it("rejects an unsupported model before a provider call", () => {
    expect(() => assertSupportedModel("openai", "gpt-obsolete")).toThrow(AiRequestError)
    expect(() => assertSupportedModel("google", "gpt-5.4-mini")).toThrow(AiRequestError)
  })
})
