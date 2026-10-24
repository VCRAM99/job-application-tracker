/**
 * Live Gemini extraction eval. This file is not part of the Vitest suite.
 *
 * It sends the fictional fixtures to Gemini and prints precision, recall,
 * grounding drop rate, and token usage. It does not write to a database.
 *
 *   GEMINI_API_KEY=... npx tsx scripts/eval/job-analysis-live.ts
 *
 * Warning: this makes real API calls and spends tokens.
 */
import { GoogleGenAI } from "@google/genai"

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

const model = process.env.JOB_ANALYSIS_GOOGLE_MODEL?.trim() || "gemini-2.5-flash"
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
    const response = await client.models.generateContent({
      model,
      contents: extractionUserMessage(validated.text),
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: EXTRACTION_JSON_SCHEMA,
      },
    })
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
  console.error(error instanceof Error ? error.message : "Gemini request failed")
  process.exit(1)
})
