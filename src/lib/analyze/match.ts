import { canonicalSkill, experienceYears, seniorityCompatible } from "@/lib/analyze/facts"
import type {
  AiMatchInput,
  GroundedRequirement,
  RequirementMatch,
  VerifiedFact,
} from "@/lib/analyze/types"

const TITLE_STOP = new Set([
  "with",
  "and",
  "the",
  "for",
  "years",
  "year",
  "experience",
  "required",
  "preferred",
  "ability",
  "strong",
  "using",
  "work",
  "team",
  "role",
])

function contentTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length > 3 && !TITLE_STOP.has(token))
}

function skillNeedles(requirement: GroundedRequirement): string[] {
  const fromList = requirement.normalizedSkills.map(canonicalSkill).filter((skill) => skill.length > 1)
  if (fromList.length > 0) return [...new Set(fromList)]
  if (requirement.category !== "skill") return []
  const fromText = canonicalSkill(requirement.text)
  return fromText.length > 1 ? [fromText] : []
}

function matchSkills(
  requirement: GroundedRequirement,
  facts: VerifiedFact[],
): RequirementMatch | null {
  const needles = skillNeedles(requirement)
  if (needles.length === 0) return null
  const skills = facts.filter((fact) => fact.type === "skill")
  const hits = new Set<string>()
  for (const needle of needles) {
    for (const skill of skills) {
      if (canonicalSkill(skill.title) === needle) hits.add(skill.id)
    }
  }
  if (hits.size === 0) return null
  const names = skills.filter((skill) => hits.has(skill.id)).map((skill) => skill.title)
  const status = hits.size >= needles.length ? "met" : "partial"
  return {
    requirementId: requirement.id,
    status,
    factIds: [...hits],
    rationale: `Verified skill ${names.join(", ")} matches this requirement.`,
    method: "deterministic",
    blocker: null,
  }
}

function matchNamedFacts(
  requirement: GroundedRequirement,
  facts: VerifiedFact[],
  type: "certification" | "education",
): RequirementMatch | null {
  const needles = skillNeedles(requirement)
  const text = canonicalSkill(requirement.text)
  const pool = facts.filter((fact) => fact.type === type)
  const hits = pool.filter((fact) => {
    const name = canonicalSkill(fact.title)
    return needles.includes(name) || (text.length > 2 && (name === text || text.includes(name) || name.includes(text)))
  })
  if (hits.length === 0) return null
  return {
    requirementId: requirement.id,
    status: "met",
    factIds: hits.map((fact) => fact.id),
    rationale: `Verified ${type} ${hits.map((fact) => fact.title).join(", ")} matches this requirement.`,
    method: "deterministic",
    blocker: null,
  }
}

function matchYears(
  requirement: GroundedRequirement,
  facts: VerifiedFact[],
  now: Date,
): RequirementMatch | null {
  if (requirement.category !== "experience_years" || requirement.minYears == null) return null
  const years = experienceYears(facts, now)
  if (years == null) return null
  const employment = facts.filter((fact) => fact.type === "employment" && fact.startDate)
  const shortfall = years < requirement.minYears
  return {
    requirementId: requirement.id,
    status: shortfall ? "not_evidenced" : "met",
    factIds: employment.map((fact) => fact.id),
    rationale: `Verified employment dates cover ${years} year(s). This requirement asks for ${requirement.minYears}.`,
    method: "deterministic",
    blocker: shortfall ? "experience_years" : null,
  }
}

function matchTitle(requirement: GroundedRequirement, facts: VerifiedFact[]): RequirementMatch | null {
  if (requirement.category === "skill" || requirement.category === "work_authorization_location") return null
  const wanted = contentTokens(requirement.text)
  if (wanted.length === 0) return null
  const hits = facts.filter((fact) => {
    if (fact.type !== "employment") return false
    const held = new Set(contentTokens(fact.title))
    const overlap = wanted.some((token) => held.has(token))
    return overlap && seniorityCompatible(requirement.text, fact.title)
  })
  if (hits.length === 0) return null
  return {
    requirementId: requirement.id,
    status: "met",
    factIds: hits.map((fact) => fact.id),
    rationale: `Verified role ${hits.map((fact) => fact.title).join(", ")} matches the title or seniority in this requirement.`,
    method: "deterministic",
    blocker: null,
  }
}

/**
 * Verified career facts do not record work authorization or location, so these
 * requirements are never scored or sent to a model. The user confirms them.
 * A blocker needs an explicit contradiction, and no verified fact or saved
 * preference feeds this analysis yet, so none is recorded here.
 */
function confirmMatch(requirement: GroundedRequirement): RequirementMatch {
  return {
    requirementId: requirement.id,
    status: "unclear",
    factIds: [],
    rationale: "Confirm this yourself. Verified career facts do not record work authorization or location.",
    method: "deterministic",
    blocker: null,
  }
}

export function deterministicMatches(
  requirements: GroundedRequirement[],
  facts: VerifiedFact[],
  now = new Date(),
): { matches: RequirementMatch[]; remaining: GroundedRequirement[] } {
  const matches: RequirementMatch[] = []
  const remaining: GroundedRequirement[] = []
  for (const requirement of requirements) {
    if (requirement.category === "work_authorization_location") {
      matches.push(confirmMatch(requirement))
      continue
    }
    const years = matchYears(requirement, facts, now)
    if (years) {
      matches.push(years)
      continue
    }
    const skillEligible =
      requirement.category === "skill" ||
      requirement.category === "domain" ||
      (requirement.normalizedSkills.length > 0 &&
        requirement.category !== "experience_years" &&
        requirement.category !== "work_authorization_location")
    const skills = skillEligible ? matchSkills(requirement, facts) : null
    if (skills) {
      matches.push(skills)
      continue
    }
    if (requirement.category === "certification") {
      const certification = matchNamedFacts(requirement, facts, "certification")
      if (certification) {
        matches.push(certification)
        continue
      }
    }
    if (requirement.category === "education") {
      const education = matchNamedFacts(requirement, facts, "education")
      if (education) {
        matches.push(education)
        continue
      }
    }
    const title = matchTitle(requirement, facts)
    if (title) {
      matches.push(title)
      continue
    }
    remaining.push(requirement)
  }
  return { matches, remaining }
}

export function applyAiMatches(
  remaining: GroundedRequirement[],
  aiMatches: AiMatchInput[],
  allowedFactIds: Set<string>,
): RequirementMatch[] {
  const byId = new Map(aiMatches.map((match) => [match.requirementId, match]))
  return remaining.map((requirement) => {
    const ai = byId.get(requirement.id)
    if (!ai) {
      return {
        requirementId: requirement.id,
        status: "unclear",
        factIds: [],
        rationale: "No match was returned for this requirement.",
        method: "ai",
        blocker: null,
      }
    }
    const factIds = [...new Set(ai.factIds.filter((id) => allowedFactIds.has(id)))]
    const status = (ai.status === "met" || ai.status === "partial") && factIds.length === 0 ? "unclear" : ai.status
    return {
      requirementId: requirement.id,
      status,
      factIds,
      rationale: ai.rationale || "Compared with verified career facts.",
      method: "ai",
      blocker: null,
    }
  })
}
