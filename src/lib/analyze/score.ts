import type {
  Blocker,
  GroundedRequirement,
  RequirementMatch,
  ScoreBreakdown,
} from "@/lib/analyze/types"

const KIND_WEIGHT = { required: 2, preferred: 1 } as const
const STATUS_WEIGHT = { met: 1, partial: 0.5, not_evidenced: 0 } as const

export function scoreRequirements(
  requirements: GroundedRequirement[],
  matches: RequirementMatch[],
): { breakdown: ScoreBreakdown; blockers: Blocker[] } {
  const byId = new Map(matches.map((match) => [match.requirementId, match]))
  let weightedSum = 0
  let weightedMax = 0
  let scorableCount = 0
  let unclearCount = 0
  let confirmCount = 0
  const blockers: Blocker[] = []

  for (const requirement of requirements) {
    const match = byId.get(requirement.id)
    const status = match?.status ?? "unclear"
    if (match?.blocker) {
      blockers.push({
        requirementId: requirement.id,
        kind: match.blocker,
        text: match.rationale || requirement.text,
      })
    }
    if (requirement.category === "work_authorization_location") {
      confirmCount += 1
      continue
    }
    if (status === "unclear") {
      unclearCount += 1
      continue
    }
    const kindWeight = KIND_WEIGHT[requirement.kind]
    weightedMax += kindWeight
    weightedSum += kindWeight * STATUS_WEIGHT[status]
    scorableCount += 1
  }

  const score = weightedMax === 0 ? null : Math.round((100 * weightedSum) / weightedMax)
  const considered = requirements.length - confirmCount
  const coverageConfidence = considered === 0 ? null : scorableCount / considered
  return {
    breakdown: {
      score,
      weightedSum,
      weightedMax,
      coverageConfidence,
      scorableCount,
      unclearCount,
      confirmCount,
    },
    blockers,
  }
}
