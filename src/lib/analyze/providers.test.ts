import { describe, expect, it } from "vitest"

import { completeAnthropic } from "@/lib/ai/providers/anthropic"
import { completeGemini } from "@/lib/ai/providers/google"
import { completeOpenAI } from "@/lib/ai/providers/openai"
import type { StructuredRequest } from "@/lib/ai/types"
import { EXTRACTION_JSON_SCHEMA, MATCH_JSON_SCHEMA, parseExtraction, parseMatches } from "@/lib/analyze/schema"

const extractionJson = JSON.stringify({
  requirements: [
    {
      text: "TypeScript",
      kind: "required",
      category: "skill",
      normalizedSkills: ["TypeScript"],
      minYears: null,
      evidenceQuote: "Required: TypeScript.",
    },
  ],
})

const matchJson = JSON.stringify({
  matches: [
    {
      requirementId: "req-0",
      status: "not_evidenced",
      factIds: [],
      rationale: "No verified fact supports this requirement.",
    },
  ],
})

function request(schemaName: string, model: string, jsonSchema: Record<string, unknown>): StructuredRequest {
  return { apiKey: "test-key", model, system: "system", user: "user", schemaName, jsonSchema }
}

describe("job analysis provider adapters", () => {
  it("accepts OpenAI structured output for both pipeline calls and rejects malformed output", async () => {
    const extraction = await completeOpenAI(request("job_requirement_extraction", "gpt-5.4-mini", EXTRACTION_JSON_SCHEMA), {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: extractionJson }, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 3 } }) } },
    })
    const matches = await completeOpenAI(request("job_requirement_matches", "gpt-5.4-mini", MATCH_JSON_SCHEMA), {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: matchJson }, finish_reason: "stop" }] }) } },
    })
    expect(parseExtraction(extraction.text)?.requirements).toHaveLength(1)
    expect(parseMatches(matches.text)?.matches[0]?.status).toBe("not_evidenced")
    expect(parseExtraction("{")).toBeNull()
    await expect(
      completeOpenAI(request("job_requirement_extraction", "gpt-5.4-mini", EXTRACTION_JSON_SCHEMA), {
        chat: { completions: { create: async () => ({ choices: [{ message: { content: "" } }] }) } },
      }),
    ).rejects.toMatchObject({ code: "invalid_response" })
  })

  it("accepts Anthropic structured output for both pipeline calls and rejects malformed output", async () => {
    const client = (text: string) => ({
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text }],
          stop_reason: "end_turn",
          usage: { input_tokens: 2, output_tokens: 2 },
        }),
      },
    })
    const extraction = await completeAnthropic(
      request("job_requirement_extraction", "claude-haiku-4-5", EXTRACTION_JSON_SCHEMA),
      client(extractionJson),
    )
    const matches = await completeAnthropic(
      request("job_requirement_matches", "claude-haiku-4-5", MATCH_JSON_SCHEMA),
      client(matchJson),
    )
    expect(parseExtraction(extraction.text)?.requirements[0]?.category).toBe("skill")
    expect(parseMatches(matches.text)?.matches).toHaveLength(1)
    expect(parseMatches("[]")).toBeNull()
    await expect(
      completeAnthropic(request("job_requirement_matches", "claude-haiku-4-5", MATCH_JSON_SCHEMA), client("")),
    ).rejects.toMatchObject({ code: "invalid_response" })
  })

  it("accepts Gemini structured output for both pipeline calls and rejects malformed output", async () => {
    const client = (text: string) => ({
      models: {
        generateContent: async () => ({
          text,
          usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 2 },
          candidates: [{ finishReason: "STOP" }],
        }),
      },
    })
    const extraction = await completeGemini(
      request("job_requirement_extraction", "gemini-2.5-flash", EXTRACTION_JSON_SCHEMA),
      client(extractionJson),
    )
    const matches = await completeGemini(
      request("job_requirement_matches", "gemini-2.5-flash", MATCH_JSON_SCHEMA),
      client(matchJson),
    )
    expect(extraction.inputTokens).toBe(6)
    expect(parseExtraction(extraction.text)?.requirements[0]?.normalizedSkills).toEqual(["TypeScript"])
    expect(parseMatches(matches.text)?.matches[0]?.requirementId).toBe("req-0")
    expect(parseExtraction("")).toBeNull()
    await expect(
      completeGemini(request("job_requirement_extraction", "gemini-2.5-flash", EXTRACTION_JSON_SCHEMA), client("")),
    ).rejects.toMatchObject({ code: "invalid_response" })
  })
})
