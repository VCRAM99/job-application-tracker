export const QUESTIONS_PROMPT_VERSION = "coach-questions-2026-11-03"
export const STORIES_PROMPT_VERSION = "coach-stories-2026-11-03"
export const PRACTICE_PROMPT_VERSION = "coach-practice-2026-11-03"
export const RESEARCH_PROMPT_VERSION = "coach-research-2026-11-03"
export const DRAFT_PROMPT_VERSION = "coach-draft-2026-11-03"
export const COACH_SCHEMA_VERSION = "coach-schema-1"

export const MAX_TECHNICAL_QUESTIONS = 8
export const MAX_BEHAVIORAL_QUESTIONS = 6
export const QUESTION_BOUNDS = { min: 15, max: 300 }

export const COMPETENCIES = ["ownership", "conflict", "failure", "leadership", "ambiguity", "impact"] as const
export type Competency = (typeof COMPETENCIES)[number]
export const COMPETENCY_LABELS: Record<Competency, string> = {
  ownership: "Ownership",
  conflict: "Conflict",
  failure: "Failure",
  leadership: "Leadership",
  ambiguity: "Ambiguity",
  impact: "Impact",
}
export const STAR_BOUNDS = { min: 10, max: 400 }

export const ANSWER_BOUNDS = { min: 20, max: 6000 }
export const NOTE_BOUNDS = { min: 10, max: 500 }

export const SOURCE_TEXT_MAX = 20_000
export const PASTED_SOURCE_MIN = 40
export const MAX_SOURCES = 6
export const MAX_CLAIMS = 25

export const DRAFT_KINDS = [
  "outreach_recruiter",
  "outreach_hiring_manager",
  "referral_request",
  "follow_up",
  "thank_you",
  "application_answer",
] as const
export type DraftKind = (typeof DRAFT_KINDS)[number]
export const DRAFT_KIND_LABELS: Record<DraftKind, string> = {
  outreach_recruiter: "Recruiter outreach",
  outreach_hiring_manager: "Hiring manager outreach",
  referral_request: "Referral request",
  follow_up: "Follow-up",
  thank_you: "Thank-you",
  application_answer: "Application answer",
}
export const MAX_DRAFT_SENTENCES = 30
