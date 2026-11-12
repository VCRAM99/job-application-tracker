/**
 * Deterministic checks applied while grounding extracted requirements. They only remove items;
 * they never add or rewrite one, so grounding rules are unchanged.
 *
 * - Boilerplate: quotes from the parts of a posting that are not requirements (equal-opportunity
 *   and accommodation statements, pay, benefits, "not an offer of employment", how to apply).
 * - Duplicates: postings often repeat a requirement ("Again: strong SQL is essential."). A
 *   requirement with the same quote as an earlier kept one, or nearly the same wording, is
 *   dropped. The earlier one is kept.
 */

const BOILERPLATE: RegExp[] = [
  /\bequal (employment )?opportunity\b/i,
  /\bnot an offer of employment\b/i,
  /\baccommodations?\b.*\b(request|interview|disabilit)/i,
  /\b(salary|compensation|pay|hourly rate|wage)( range)?\s*(:|is|of)?\s*[$€£]?\d/i,
  /[$€£]\s?\d[\d,.]*\s*(k\b)?\s*(–|-|to)\s*[$€£]?\s?\d/i,
  /\b(401\(k\)|paid (vacation|holidays|sick leave|time off)|unlimited pto|parental leave|stock options|learning budget|home-office stipend|commuter benefits|dental)\b/i,
  /\b(to apply|send (us )?(a|your) (resume|cv))\b/i,
]

export function isBoilerplateQuote(quote: string): boolean {
  return BOILERPLATE.some((pattern) => pattern.test(quote))
}

const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "in", "with", "for", "to", "or", "on", "is", "are", "be", "you", "your", "we",
  "this", "that", "role", "must", "strong", "skills", "skill", "experience", "required", "requirement",
  "essential", "again", "have", "has", "will", "should", "at", "least", "plus", "preferred", "nice",
])

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/\.+$/, ""))
      .filter((token) => token.length > 1 && !STOPWORDS.has(token)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared += 1
  return shared / (a.size + b.size - shared)
}

export const NEAR_DUPLICATE_THRESHOLD = 0.75

/** True when `candidate` repeats a requirement already in `kept`. */
type Comparable = { text: string; evidenceQuote: string; category?: string; normalizedSkills?: string[] }

const skillSet = (skills: string[] | undefined) => new Set((skills ?? []).map((skill) => skill.trim().toLowerCase()).filter(Boolean))

export function isDuplicateRequirement(candidate: Comparable, kept: Comparable[]): boolean {
  const quote = candidate.evidenceQuote.toLowerCase()
  const tokens = contentTokens(candidate.text)
  const skills = skillSet(candidate.normalizedSkills)
  return kept.some((existing) => {
    const other = existing.evidenceQuote.toLowerCase()
    if (quote === other) return true
    // A repeated skill requirement ("Strong TypeScript skills are a must") names no skill the earlier
    // one ("Strong TypeScript and Node.js") does not already cover.
    if (candidate.category === "skill" && existing.category === "skill" && skills.size > 0) {
      const covered = skillSet(existing.normalizedSkills)
      if ([...skills].every((skill) => covered.has(skill))) return true
    }
    const similarity = jaccard(tokens, contentTokens(existing.text))
    // One line can hold two requirements ("TypeScript and Node.js"), so an overlapping quote
    // alone is not enough: the wording must also be close.
    if ((quote.includes(other) || other.includes(quote)) && similarity > 0.5) return true
    return similarity >= NEAR_DUPLICATE_THRESHOLD
  })
}
