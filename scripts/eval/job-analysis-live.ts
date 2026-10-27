/**
 * Live Gemini extraction eval. This file is not part of the Vitest suite.
 *
 * It sends the fictional fixtures to Gemini and prints precision, recall,
 * grounding drop rate, and token usage. It does not write to a database.
 *
 *   GEMINI_API_KEY=... npx tsx scripts/eval/job-analysis-live.ts
 *
 * The model is the app's Google default from src/lib/analyze/constants.ts,
 * or JOB_ANALYSIS_GOOGLE_MODEL when set. Either must be in the model registry.
 * If the default is overloaded, try the Flash-Lite fallback:
 *
 *   JOB_ANALYSIS_GOOGLE_MODEL=gemini-3.5-flash-lite GEMINI_API_KEY=... npx tsx scripts/eval/job-analysis-live.ts
 *
 * A 503 or overloaded response is retried once after a short wait, as in the app.
 *
 * Warning: this makes real API calls and spends tokens.
 */
import { GoogleGenAI, ThinkingLevel } from "@google/genai"

import { findModel, responseSchemaFor } from "../../src/lib/ai/models"
import { mapProviderFailure, withOverloadRetry } from "../../src/lib/ai/provider-error"
import { analysisModelFor } from "../../src/lib/analyze/constants"
import { JOB_FIXTURES, type JobFixture } from "../../src/lib/analyze/fixtures"
import { groundRequirements } from "../../src/lib/analyze/ground"
import { EXTRACTION_SYSTEM_PROMPT, extractionUserMessage } from "../../src/lib/analyze/prompt"
import { EXTRACTION_JSON_SCHEMA, parseExtraction } from "../../src/lib/analyze/schema"
import { validateJobDescription } from "../../src/lib/analyze/text"

console.warn("WARNING: this script makes real Gemini API calls and spends tokens. It does not write to the database.")

const apiKey = process.env.GEMINI_API_KEY?.trim()
if (!apiKey) {
  console.error("Set GEMINI_API_KEY in the environment. The key is read only for this process.")
  process.exit(1)
}

let model: string
try {
  model = analysisModelFor("google")
} catch {
  console.error("JOB_ANALYSIS_GOOGLE_MODEL is not in the model registry (src/lib/ai/models.ts).")
  process.exit(1)
}
const thinkingConfig = findModel("google", model)?.thinkingLevel ? { thinkingLevel: ThinkingLevel.LOW } : undefined
console.warn(`Model: ${model}${thinkingConfig ? " (low thinking)" : ""}`)
const client = new GoogleGenAI({ apiKey })

function includesExpected(text: string, needle: string) {
  return text.toLowerCase().includes(needle.toLowerCase())
}

function scoreFixture(fixture: JobFixture, extracted: Array<{ text: string; evidenceQuote: string }>) {
  const matchedExpected = fixture.expected.filter((expected) =>
    extracted.some(
      (requirement) =>
        includesExpected(requirement.text, expected.textIncludes) ||
        includesExpected(requirement.evidenceQuote, expected.textIncludes),
    ),
  )
  const matchedExtracted = extracted.filter((requirement) =>
    fixture.expected.some(
      (expected) =>
        includesExpected(requirement.text, expected.textIncludes) ||
        includesExpected(requirement.evidenceQuote, expected.textIncludes),
    ),
  )
  const precision = extracted.length === 0 ? (fixture.expected.length === 0 ? 1 : 0) : matchedExtracted.length / extracted.length
  const recall = fixture.expected.length === 0 ? 1 : matchedExpected.length / fixture.expected.length
  return { precision, recall }
}

async function main() {
  let inputTokens = 0
  let outputTokens = 0
  let dropped = 0
  let proposed = 0
  const rows: string[] = []

  for (const fixture of JOB_FIXTURES) {
    const validated = validateJobDescription(fixture.jd)
    if (fixture.rejected || !validated.ok) {
      rows.push(`${fixture.id}\tlocal-reject\tn/a\tn/a\t0`)
      continue
    }
    const response = await withOverloadRetry(() =>
      client.models.generateContent({
        model,
        contents: extractionUserMessage(validated.text),
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchemaFor("google", model, EXTRACTION_JSON_SCHEMA),
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      }),
    )
    inputTokens += response.usageMetadata?.promptTokenCount ?? 0
    outputTokens += response.usageMetadata?.candidatesTokenCount ?? 0
    const parsed = parseExtraction(response.text ?? "")
    if (!parsed) {
      rows.push(`${fixture.id}\tinvalid-json\t0\t0\t1`)
      continue
    }
    const grounded = groundRequirements(validated.text, parsed.requirements)
    proposed += parsed.requirements.length
    dropped += grounded.dropped
    const scored = scoreFixture(
      fixture,
      grounded.kept.map((requirement) => ({ text: requirement.text, evidenceQuote: requirement.evidenceQuote })),
    )
    rows.push(
      `${fixture.id}\t${grounded.kept.length} kept / ${grounded.dropped} dropped\t${scored.precision.toFixed(2)}\t${scored.recall.toFixed(2)}\t${response.usageMetadata?.promptTokenCount ?? 0}`,
    )
  }

  console.log("fixture\tresult\tprecision\trecall\tinput tokens")
  for (const row of rows) console.log(row)
  const dropRate = proposed === 0 ? 0 : dropped / proposed
  console.log(`grounding drop rate\t${dropRate.toFixed(2)} (${dropped} dropped / ${proposed} model requirements)`)
  console.log(`token usage\tinput ${inputTokens}\toutput ${outputTokens}`)
}

main().catch((error: unknown) => {
  const ai = mapProviderFailure(error)
  console.error(ai.code === "model_unavailable" ? `${ai.message} Model: ${model}.` : ai.message)
  const status = error && typeof error === "object" && "status" in error ? (error as { status: unknown }).status : "none"
  console.error(`HTTP status: ${String(status)}`)
  if (error instanceof Error) console.error(error.message)
  process.exit(1)
})
