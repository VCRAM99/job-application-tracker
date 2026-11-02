import type { VerifiedFact } from "@/lib/analyze/types"

/** The text a fact contributes as evidence: its title, detail, and evidence excerpt. */
export function factEvidence(fact: VerifiedFact): string {
  return [fact.title, fact.detail, fact.evidence, fact.startDate, fact.endDate].filter(Boolean).join(" \n ")
}

/**
 * Keeps fact ids that name one of the caller's user_verified facts. The fact
 * list must come from `loadVerifiedFacts`, which reads only verified rows the
 * caller owns. Unknown, suggested, rejected, or foreign ids are dropped.
 */
export function keepVerifiedFactIds(ids: string[], facts: VerifiedFact[]): { ids: string[]; dropped: number } {
  const known = new Set(facts.map((fact) => fact.id))
  const kept = [...new Set(ids.filter((id) => known.has(id)))]
  return { ids: kept, dropped: ids.length - ids.filter((id) => known.has(id)).length }
}
