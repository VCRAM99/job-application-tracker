import { groundRequirements } from "@/lib/analyze/ground"
import { applyAiMatches, deterministicMatches } from "@/lib/analyze/match"
import { readabilityReport } from "@/lib/analyze/readability"
import { scoreRequirements } from "@/lib/analyze/score"
import { validateJobDescription } from "@/lib/analyze/text"
import type { AiMatchInput, BuiltAnalysis, RawRequirement, VerifiedFact } from "@/lib/analyze/types"

export function buildAnalysis(input: {
  jdText: string
  extracted: RawRequirement[]
  aiMatches: AiMatchInput[]
  facts: VerifiedFact[]
  resume?: { sourceId: string; text: string } | null
  now?: Date
}): { ok: true; analysis: BuiltAnalysis } | { ok: false; message: string } {
  const validated = validateJobDescription(input.jdText)
  if (!validated.ok) return validated
  const grounded = groundRequirements(validated.text, input.extracted)
  const deterministic = deterministicMatches(grounded.kept, input.facts, input.now)
  const allowed = new Set(input.facts.map((fact) => fact.id))
  const ai = applyAiMatches(deterministic.remaining, input.aiMatches, allowed)
  const matches = [...deterministic.matches, ...ai]
  const scored = scoreRequirements(grounded.kept, matches)
  return {
    ok: true,
    analysis: {
      normalizedJd: validated.text,
      requirements: grounded.kept,
      matches,
      blockers: scored.blockers,
      droppedRequirementCount: grounded.dropped,
      score: scored.breakdown.score,
      scoreBreakdown: scored.breakdown,
      readability: input.resume
        ? readabilityReport(input.resume.sourceId, input.resume.text, grounded.kept)
        : null,
    },
  }
}
