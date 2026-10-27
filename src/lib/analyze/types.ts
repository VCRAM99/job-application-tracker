export const REQUIREMENT_KINDS = ["required", "preferred"] as const
export const REQUIREMENT_CATEGORIES = [
  "skill",
  "experience_years",
  "education",
  "certification",
  "domain",
  "work_authorization_location",
  "other",
] as const
export const MATCH_STATUSES = ["met", "partial", "not_evidenced", "unclear"] as const

export type RequirementKind = (typeof REQUIREMENT_KINDS)[number]
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number]
export type MatchStatus = (typeof MATCH_STATUSES)[number]
export type MatchMethod = "deterministic" | "ai"
export type BlockerKind = "experience_years" | "work_authorization_location"
export type FactKind =
  | "employment"
  | "education"
  | "skill"
  | "project"
  | "accomplishment"
  | "certification"

export type VerifiedFact = {
  id: string
  type: FactKind
  updatedAt: string
  title: string
  detail: string
  evidence: string | null
  startDate: string | null
  endDate: string | null
}

export type RawRequirement = {
  text: string
  kind: RequirementKind
  category: RequirementCategory
  normalizedSkills: string[]
  minYears: number | null
  evidenceQuote: string
}

export type GroundedRequirement = RawRequirement & {
  id: string
  spanStart: number
  spanEnd: number
}

export type RequirementMatch = {
  requirementId: string
  status: MatchStatus
  factIds: string[]
  rationale: string
  method: MatchMethod
  blocker: BlockerKind | null
}

export type ScoreBreakdown = {
  score: number | null
  weightedSum: number
  weightedMax: number
  coverageConfidence: number | null
  scorableCount: number
  unclearCount: number
  /** Work authorization or location requirements left for the user to confirm. */
  confirmCount?: number
}

export type Blocker = {
  requirementId: string
  kind: BlockerKind
  text: string
}

export type ReadabilityReport = {
  label: "readability heuristics"
  sourceId: string
  headings: string[]
  hasContactBlock: boolean
  dateFormats: string[]
  dateFormatConsistent: boolean
  characterCount: number
  wordCount: number
  lengthWithinBounds: boolean
  requiredSkillCoverage: number | null
  coveredSkills: string[]
  missingSkills: string[]
  notes: string[]
}

export type BuiltAnalysis = {
  normalizedJd: string
  requirements: GroundedRequirement[]
  matches: RequirementMatch[]
  blockers: Blocker[]
  droppedRequirementCount: number
  score: number | null
  scoreBreakdown: ScoreBreakdown
  readability: ReadabilityReport | null
}

export type AiMatchInput = {
  requirementId: string
  status: MatchStatus
  factIds: string[]
  rationale: string
}
