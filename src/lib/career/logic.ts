import { sha256 } from "@/lib/ai/crypto"
import type { CareerExtraction, FactType } from "@/lib/ai/extraction"

export type PlannedSuggestion = {
  factType: FactType
  payload: Record<string, unknown>
  evidenceExcerpt: string
  dedupeKey: string
}

export function planSuggestions(sourceId: string, extraction: CareerExtraction): PlannedSuggestion[] {
  const planned: PlannedSuggestion[] = []
  for (const fact of extraction.employment) {
    planned.push(plan(sourceId, "employment", fact, `${fact.organization}|${fact.title}|${fact.startDate ?? ""}`))
  }
  for (const fact of extraction.education) {
    planned.push(plan(sourceId, "education", fact, `${fact.institution}|${fact.credential}|${fact.startDate ?? ""}`))
  }
  for (const fact of extraction.skills) {
    planned.push(plan(sourceId, "skill", fact, fact.name))
  }
  for (const fact of extraction.projects) {
    planned.push(plan(sourceId, "project", fact, fact.name))
  }
  for (const fact of extraction.accomplishments) {
    planned.push(plan(sourceId, "accomplishment", fact, fact.title))
  }
  for (const fact of extraction.certifications) {
    planned.push(plan(sourceId, "certification", fact, `${fact.name}|${fact.issuedOn ?? ""}`))
  }
  return planned
}

export function normalizeIdentity(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function plan(
  sourceId: string,
  factType: FactType,
  payload: object,
  identity: string,
): PlannedSuggestion {
  const record = payload as { evidence?: string }
  return {
    factType,
    payload: payload as Record<string, unknown>,
    evidenceExcerpt: (record.evidence ?? "").slice(0, 500),
    dedupeKey: sha256(`${sourceId}\n${factType}\n${normalizeIdentity(identity)}`),
  }
}

export type ReviewStatus = "pending" | "accepted" | "rejected"

export type ReviewSuggestion = PlannedSuggestion & {
  id: string
  userId: string
  sourceId: string
  status: ReviewStatus
  resultingFactId: string | null
}

export type VerifiedFact = {
  id: string
  userId: string
  sourceId: string
  suggestionId: string
  factType: FactType
  payload: Record<string, unknown>
  verificationState: "user_verified"
}

export type ReviewState = {
  suggestions: ReviewSuggestion[]
  facts: VerifiedFact[]
}

export function reviewFromPlan(
  userId: string,
  sourceId: string,
  planned: PlannedSuggestion[],
): ReviewState {
  return {
    suggestions: planned.map((item, index) => ({
      ...item,
      id: `suggestion-${index + 1}`,
      userId,
      sourceId,
      status: "pending",
      resultingFactId: null,
    })),
    facts: [],
  }
}

export function acceptReview(
  state: ReviewState,
  userId: string,
  suggestionId: string,
  edits?: Record<string, unknown>,
): ReviewState {
  const suggestion = state.suggestions.find((item) => item.id === suggestionId)
  if (!suggestion || suggestion.userId !== userId) {
    throw new Error("suggestion not found")
  }
  if (suggestion.status === "accepted" && suggestion.resultingFactId) {
    return state
  }
  if (suggestion.status !== "pending") {
    throw new Error("suggestion is not pending")
  }
  const factId = `fact-${suggestion.id}`
  const payload = edits ? { ...suggestion.payload, ...edits } : suggestion.payload
  return {
    suggestions: state.suggestions.map((item) =>
      item.id === suggestionId
        ? { ...item, status: "accepted", resultingFactId: factId, payload }
        : item,
    ),
    facts: [
      ...state.facts,
      {
        id: factId,
        userId,
        sourceId: suggestion.sourceId,
        suggestionId,
        factType: suggestion.factType,
        payload,
        verificationState: "user_verified",
      },
    ],
  }
}

export function rejectReview(state: ReviewState, userId: string, suggestionId: string): ReviewState {
  const suggestion = state.suggestions.find((item) => item.id === suggestionId)
  if (!suggestion || suggestion.userId !== userId) throw new Error("suggestion not found")
  if (suggestion.status === "rejected") return state
  if (suggestion.status !== "pending") throw new Error("suggestion is not pending")
  return {
    ...state,
    suggestions: state.suggestions.map((item) =>
      item.id === suggestionId ? { ...item, status: "rejected" } : item,
    ),
  }
}
