import { MAX_REQUIREMENTS } from "@/lib/analyze/constants"
import { normalizeJobText } from "@/lib/analyze/text"
import type { GroundedRequirement, RawRequirement } from "@/lib/analyze/types"

export function groundRequirements(
  normalizedJd: string,
  raw: RawRequirement[],
): { kept: GroundedRequirement[]; dropped: number } {
  const kept: GroundedRequirement[] = []
  let dropped = 0
  for (const requirement of raw) {
    const quote = normalizeJobText(requirement.evidenceQuote)
    const start = quote ? normalizedJd.indexOf(quote) : -1
    if (!quote || start < 0) {
      dropped += 1
      continue
    }
    if (kept.length >= MAX_REQUIREMENTS) {
      dropped += 1
      continue
    }
    kept.push({
      ...requirement,
      normalizedSkills: requirement.normalizedSkills.map((skill) => skill.trim()).filter(Boolean).slice(0, 12),
      evidenceQuote: quote,
      spanStart: start,
      spanEnd: start + quote.length,
      id: `req-${kept.length}`,
    })
  }
  return { kept, dropped }
}
