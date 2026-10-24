import { textTokens } from "@/lib/jobs/text"

export const MATCH_WEIGHTS = {
  skills: 30,
  title: 25,
  seniority: 15,
  seniorityUnknown: 5,
  experience: 10,
  preferred: 10,
  freshWeek: 10,
  freshMonth: 6,
  freshQuarter: 3,
} as const

export type MatchSignals = {
  skillTokens: string[]
  roleTokens: string[]
  experienceTokens: string[]
  seniorities: string[]
}

export type ScorePosting = {
  titleTokens: string[]
  skillTokens: string[]
  seniority: string
  preferred: boolean
  referenceAt: string | null
}

export type MatchReason = {
  code: string
  points: number
  text: string
}

export type MatchEstimate = {
  score: number
  reasons: MatchReason[]
}

const DAY_MS = 86_400_000

export function overlapCount(left: readonly string[], right: readonly string[]): number {
  const rightSet = new Set(right)
  const shared = new Set<string>()
  for (const token of left) {
    if (rightSet.has(token)) shared.add(token)
  }
  return shared.size
}

export function emptySignals(): MatchSignals {
  return { skillTokens: [], roleTokens: [], experienceTokens: [], seniorities: [] }
}

export function signalsFromVerified(input: {
  skills: readonly string[]
  targetRoles: readonly string[]
  titles: readonly string[]
  seniorities: readonly string[]
}): MatchSignals {
  return {
    skillTokens: textTokens(input.skills.join(" ")),
    roleTokens: textTokens(input.targetRoles.join(" ")),
    experienceTokens: textTokens(input.titles.join(" ")),
    seniorities: [...input.seniorities],
  }
}

function freshnessPoints(referenceAt: string | null, now: Date): { points: number; text: string; code: string } {
  if (!referenceAt) {
    return {
      code: "freshness_unknown",
      points: 0,
      text: "No posting or verification date was provided, so recency was not awarded.",
    }
  }
  const reference = new Date(referenceAt)
  if (Number.isNaN(reference.getTime())) {
    return {
      code: "freshness_unknown",
      points: 0,
      text: "The listing date could not be read, so recency was not awarded.",
    }
  }
  const days = Math.max(0, Math.floor((now.getTime() - reference.getTime()) / DAY_MS))
  const stamped = reference.toISOString().slice(0, 10)
  if (days <= 7) {
    return { code: "freshness", points: MATCH_WEIGHTS.freshWeek, text: `Checked or posted on ${stamped}.` }
  }
  if (days <= 30) {
    return { code: "freshness", points: MATCH_WEIGHTS.freshMonth, text: `Checked or posted on ${stamped}.` }
  }
  if (days <= 90) {
    return { code: "freshness", points: MATCH_WEIGHTS.freshQuarter, text: `Checked or posted on ${stamped}.` }
  }
  return { code: "freshness", points: 0, text: `The latest known date is ${stamped}, so recency was not awarded.` }
}

/**
 * Deterministic preference and qualification estimate.
 * Rejected or unverified facts must already be absent from `signals`.
 * Description text is ignored so instructions inside a listing cannot change the score.
 */
export function scorePosting(signals: MatchSignals, posting: ScorePosting, now: Date): MatchEstimate {
  const reasons: MatchReason[] = []

  if (signals.skillTokens.length === 0) {
    reasons.push({
      code: "skills_unavailable",
      points: 0,
      text: "No verified skills are on your career profile, so skill overlap was not counted.",
    })
  } else if (posting.skillTokens.length === 0) {
    reasons.push({
      code: "skills_unlisted",
      points: 0,
      text: "This listing does not name skills, so skill overlap was not awarded.",
    })
  } else {
    const shared = overlapCount(signals.skillTokens, posting.skillTokens)
    const points = Math.min(
      MATCH_WEIGHTS.skills,
      Math.round((MATCH_WEIGHTS.skills * shared) / signals.skillTokens.length),
    )
    reasons.push({
      code: "skills",
      points,
      text:
        shared === 0
          ? "None of your verified skills appear on this listing."
          : `${shared} of ${signals.skillTokens.length} verified skill terms appear on this listing.`,
    })
  }

  if (signals.roleTokens.length === 0) {
    reasons.push({
      code: "title_unset",
      points: 0,
      text: "No target roles are saved, so title alignment was not counted.",
    })
  } else if (posting.titleTokens.length === 0) {
    reasons.push({ code: "title", points: 0, text: "The title has no comparable terms." })
  } else {
    const shared = overlapCount(signals.roleTokens, posting.titleTokens)
    const points = Math.min(
      MATCH_WEIGHTS.title,
      Math.round((MATCH_WEIGHTS.title * shared) / signals.roleTokens.length),
    )
    reasons.push({
      code: "title",
      points,
      text:
        shared === 0
          ? "The title does not overlap your target roles."
          : "The title overlaps your target roles.",
    })
  }

  if (signals.seniorities.length === 0) {
    reasons.push({
      code: "seniority_unset",
      points: 0,
      text: "No seniority preference is set.",
    })
  } else if (posting.seniority === "unknown") {
    reasons.push({
      code: "seniority_unknown",
      points: MATCH_WEIGHTS.seniorityUnknown,
      text: "Seniority was not stated. It was not treated as a mismatch.",
    })
  } else if (signals.seniorities.includes(posting.seniority)) {
    reasons.push({
      code: "seniority",
      points: MATCH_WEIGHTS.seniority,
      text: "Seniority matches a level you selected.",
    })
  } else {
    reasons.push({
      code: "seniority_mismatch",
      points: 0,
      text: "Seniority is outside the levels you selected.",
    })
  }

  if (signals.experienceTokens.length === 0) {
    reasons.push({
      code: "experience_unset",
      points: 0,
      text: "No verified job titles are on your career profile, so experience overlap was not counted.",
    })
  } else {
    const shared = overlapCount(signals.experienceTokens, posting.titleTokens)
    reasons.push({
      code: "experience",
      points: Math.min(MATCH_WEIGHTS.experience, shared * 5),
      text:
        shared === 0
          ? "The title does not overlap your verified job titles."
          : "The title overlaps your verified job titles.",
    })
  }

  reasons.push(
    posting.preferred
      ? {
          code: "preferred_company",
          points: MATCH_WEIGHTS.preferred,
          text: "This company is on your preferred list.",
        }
      : {
          code: "preferred_company",
          points: 0,
          text: "This company is not on your preferred list.",
        },
  )

  reasons.push(freshnessPoints(posting.referenceAt, now))

  return {
    score: reasons.reduce((sum, reason) => sum + reason.points, 0),
    reasons,
  }
}

export type ScoredPosting<T> = T & { estimate: MatchEstimate }

/** Optional later hook. The default path does not call a model. */
export type RecommendationReranker<T> = (input: {
  jobs: Array<ScoredPosting<T>>
  signals: MatchSignals
}) => Promise<Array<ScoredPosting<T>>>

export async function applyReranker<T>(
  jobs: Array<ScoredPosting<T>>,
  signals: MatchSignals,
  reranker: RecommendationReranker<T> | null,
): Promise<Array<ScoredPosting<T>>> {
  if (!reranker) return jobs
  return reranker({ jobs, signals })
}
