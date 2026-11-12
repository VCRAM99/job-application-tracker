/**
 * Deterministic checks applied while grounding extracted requirements. They only remove items;
 * they never add or rewrite one, so grounding rules are unchanged.
 *
 * - Boilerplate: quotes from the parts of a posting that are not requirements (equal-opportunity
 *   and accommodation statements, pay, benefits, "not an offer of employment", how to apply).
 * - Duplicates: postings often repeat a requirement ("Again: strong SQL is essential."). A
 *   requirement of the same kind (required or preferred) with nearly the same wording, or naming
 *   no skill an earlier one does not, is dropped. The earlier one is kept.
 */

// Each pattern needs the context of a benefits list, a pay statement, or application steps, so a
// requirement that merely mentions a word ("dental assistant certification", "ability to apply
// statistical methods", "budgets of $5-10M") is never dropped.
const PAY_CONTEXT = /\b(salary|compensation|pay|wages?|hourly|base|ote|per (hour|year|annum)|annually|a year|an hour)\b/i
const MONEY_RANGE = /[$€£]\s?\d[\d,.]*\s*k?\s*(–|-|to)\s*[$€£]?\s?\d/i
const BENEFIT_TERMS = /(401\(k\)|\bpaid (vacation|holidays|sick leave|time off)\b|\bunlimited pto\b|\bpto\b|\bparental leave\b|\bstock options\b|\bequity\b|\bstipend\b|\b(health|dental|vision)\b.{0,30}\b(coverage|insurance|plans?|benefits)\b|\bretirement\b|\bwellness\b)/i
const BENEFIT_CONTEXT = /\b(benefits?|perks?|we offer|what we offer|offer(s|ing)?|includ(e|es|ing)|from day one|coverage)\b/i

const BOILERPLATE: Array<(quote: string) => boolean> = [
  (quote) => /\bequal (employment )?opportunity\b/i.test(quote),
  (quote) => /\bnot an offer of employment\b/i.test(quote),
  (quote) => /\baccommodations?\b.{0,80}\b(request|interview|application process|disabilit)/i.test(quote),
  (quote) => /\b(salary|compensation|pay|hourly rate|wage)( range)?\s*(:|is|of)?\s*[$€£]?\d/i.test(quote),
  (quote) => MONEY_RANGE.test(quote) && PAY_CONTEXT.test(quote),
  (quote) => BENEFIT_TERMS.test(quote) && BENEFIT_CONTEXT.test(quote),
  (quote) => /\bhow to apply\b|\bto apply,|\bapply (now|here|online|today)\b|\bsend (us )?(a|your) (resume|cv)\b/i.test(quote),
]

export function isBoilerplateQuote(quote: string): boolean {
  return BOILERPLATE.some((matches) => matches(quote))
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
type Comparable = { text: string; evidenceQuote: string; kind?: string; category?: string; normalizedSkills?: string[] }

const skillSet = (skills: string[] | undefined) => new Set((skills ?? []).map((skill) => skill.trim().toLowerCase()).filter(Boolean))

export function isDuplicateRequirement(candidate: Comparable, kept: Comparable[]): boolean {
  const quote = candidate.evidenceQuote.toLowerCase()
  const tokens = contentTokens(candidate.text)
  const skills = skillSet(candidate.normalizedSkills)
  return kept.some((existing) => {
    // A required and a preferred requirement are never merged: dropping either would change how
    // the requirement is weighed.
    if (candidate.kind !== existing.kind) return false
    const other = existing.evidenceQuote.toLowerCase()
    const similarity = jaccard(tokens, contentTokens(existing.text))
    const otherSkills = skillSet(existing.normalizedSkills)
    const sameSkills = skills.size > 0 && skills.size === otherSkills.size && [...skills].every((skill) => otherSkills.has(skill))
    // One line can hold several requirements ("Python, SQL, and Airflow"), so a shared or
    // overlapping quote alone is not enough: the wording or the named skills must also match.
    if (quote === other) return similarity > 0.5 || sameSkills
    // A repeated skill requirement ("Strong TypeScript skills are a must") names no skill the earlier
    // one ("Strong TypeScript and Node.js") does not already cover.
    if (candidate.category === "skill" && existing.category === "skill" && skills.size > 0 && [...skills].every((skill) => otherSkills.has(skill))) return true
    if ((quote.includes(other) || other.includes(quote)) && similarity > 0.5) return true
    return similarity >= NEAR_DUPLICATE_THRESHOLD
  })
}
