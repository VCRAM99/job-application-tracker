import { mapProviderFailure, withOverloadRetry } from "@/lib/ai/provider-error"
import { AiRequestError, type StructuredRequest, type StructuredResponse, type TokenUsage } from "@/lib/ai/types"
import { buildAnalysis } from "@/lib/analyze/build"
import {
  EXTRACTION_SYSTEM_PROMPT,
  MATCH_SYSTEM_PROMPT,
  extractionUserMessage,
  matchUserMessage,
} from "@/lib/analyze/prompt"
import {
  EXTRACTION_JSON_SCHEMA,
  MATCH_JSON_SCHEMA,
  parseExtraction,
  parseMatches,
} from "@/lib/analyze/schema"
import { validateJobDescription } from "@/lib/analyze/text"
import type { BuiltAnalysis, VerifiedFact } from "@/lib/analyze/types"

export type AnalysisComplete = (request: StructuredRequest) => Promise<StructuredResponse>

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  const sum = (left: number | null, right: number | null) => {
    if (left == null && right == null) return null
    return (left ?? 0) + (right ?? 0)
  }
  return {
    inputTokens: sum(total.inputTokens, next.inputTokens),
    outputTokens: sum(total.outputTokens, next.outputTokens),
  }
}

async function callWithRetry(
  complete: AnalysisComplete,
  request: StructuredRequest,
  wait?: (ms: number) => Promise<void>,
): Promise<StructuredResponse> {
  try {
    return await withOverloadRetry(() => complete(request), { wait })
  } catch (error) {
    throw mapProviderFailure(error)
  }
}

async function structuredText(
  complete: AnalysisComplete,
  request: StructuredRequest,
  parse: (text: string) => unknown,
  wait?: (ms: number) => Promise<void>,
): Promise<{ data: unknown; usage: TokenUsage }> {
  let usage: TokenUsage = { inputTokens: null, outputTokens: null }
  let user = request.user
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await callWithRetry(complete, { ...request, user }, wait)
    usage = addUsage(usage, response)
    const data = parse(response.text)
    if (data) return { data, usage }
    user = `${request.user}\nThe previous response was not valid JSON for this schema. Return only the corrected JSON.`
  }
  throw new AiRequestError("invalid_response")
}

export async function executeAnalysis(input: {
  jdText: string
  facts: VerifiedFact[]
  resume?: { sourceId: string; text: string } | null
  model: string
  complete: AnalysisComplete
  now?: Date
  wait?: (ms: number) => Promise<void>
}): Promise<{ analysis: BuiltAnalysis; usage: TokenUsage }> {
  const validated = validateJobDescription(input.jdText)
  if (!validated.ok) throw new AiRequestError("invalid_response", { message: validated.message })
  const extraction = await structuredText(
    input.complete,
    {
      apiKey: "",
      model: input.model,
      system: EXTRACTION_SYSTEM_PROMPT,
      user: extractionUserMessage(validated.text),
      schemaName: "job_requirement_extraction",
      jsonSchema: EXTRACTION_JSON_SCHEMA,
      thinking: "low",
    },
    parseExtraction,
    input.wait,
  )
  const extracted = extraction.data as ReturnType<typeof parseExtraction>
  if (!extracted) throw new AiRequestError("invalid_response")
  const preview = buildAnalysis({
    jdText: validated.text,
    extracted: extracted.requirements,
    aiMatches: [],
    facts: input.facts,
    now: input.now,
  })
  if (!preview.ok) throw new AiRequestError("invalid_response", { message: preview.message })
  const remainingIds = new Set(
    preview.analysis.matches.filter((match) => match.method !== "deterministic").map((match) => match.requirementId),
  )
  const remaining = preview.analysis.requirements.filter((requirement) => remainingIds.has(requirement.id))
  let usage = extraction.usage
  let aiMatches: Array<{ requirementId: string; status: "met" | "partial" | "not_evidenced" | "unclear"; factIds: string[]; rationale: string }> = []
  if (remaining.length > 0) {
    const matched = await structuredText(
      input.complete,
      {
        apiKey: "",
        model: input.model,
        system: MATCH_SYSTEM_PROMPT,
        user: matchUserMessage(remaining, input.facts),
        schemaName: "job_requirement_matches",
        jsonSchema: MATCH_JSON_SCHEMA,
      },
      parseMatches,
      input.wait,
    )
    const parsed = matched.data as ReturnType<typeof parseMatches>
    if (!parsed) throw new AiRequestError("invalid_response")
    aiMatches = parsed.matches
    usage = addUsage(usage, matched.usage)
  }
  const built = buildAnalysis({
    jdText: validated.text,
    extracted: extracted.requirements,
    aiMatches,
    facts: input.facts,
    resume: input.resume,
    now: input.now,
  })
  if (!built.ok) throw new AiRequestError("invalid_response", { message: built.message })
  return { analysis: built.analysis, usage }
}
