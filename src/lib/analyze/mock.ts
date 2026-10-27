import type { StructuredRequest, StructuredResponse } from "@/lib/ai/types"
import { normalizeJobText } from "@/lib/analyze/text"
import type { RawRequirement, RequirementCategory } from "@/lib/analyze/types"

const SKILL_WORDS = ["typescript", "javascript", "postgresql", "python", "react", "kubernetes", "sql", "excel"]

function categoryFor(quote: string): RequirementCategory {
  if (/\b(years?|yrs)\b/i.test(quote)) return "experience_years"
  if (/\b(authorized|visa|citizen|located|onsite|remote|canada|united states)\b/i.test(quote)) {
    return "work_authorization_location"
  }
  if (/\b(degree|bachelor|university|diploma)\b/i.test(quote)) return "education"
  if (/\b(certified|certification)\b/i.test(quote)) return "certification"
  if (SKILL_WORDS.some((skill) => quote.toLowerCase().includes(skill))) return "skill"
  return "other"
}

export function mockRequirements(jd: string): RawRequirement[] {
  const normalized = normalizeJobText(jd)
  const parts = normalized
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 24 && normalized.includes(part))
  const chosen = (parts.length > 0 ? parts : [normalized.slice(0, 180)]).slice(0, 8)
  return chosen.map((quote) => {
    const years = quote.match(/\b(\d{1,2})\s+years?\b/i)
    return {
      text: quote.slice(0, 240),
      kind: /preferred|nice to have/i.test(quote) ? "preferred" : "required",
      category: categoryFor(quote),
      normalizedSkills: SKILL_WORDS.filter((skill) => quote.toLowerCase().includes(skill)),
      minYears: years ? Number(years[1]) : null,
      evidenceQuote: quote.slice(0, 400),
    }
  })
}

export function mockStructuredResponse(request: StructuredRequest): StructuredResponse {
  if (request.schemaName === "job_requirement_extraction") {
    const start = request.user.indexOf("<job_description>")
    const end = request.user.indexOf("</job_description>")
    const jd = start >= 0 && end > start ? request.user.slice(start + "<job_description>".length, end).trim() : ""
    return {
      text: JSON.stringify({ requirements: mockRequirements(jd) }),
      inputTokens: 1,
      outputTokens: 1,
      finishReason: "mock",
    }
  }
  const ids = [...request.user.matchAll(/"id":"(req-\d+)"/g)].map((match) => match[1])
  return {
    text: JSON.stringify({
      matches: ids.map((requirementId) => ({
        requirementId,
        status: "not_evidenced",
        factIds: [],
        rationale: "Mock provider only. No live model reviewed this requirement.",
      })),
    }),
    inputTokens: 1,
    outputTokens: 1,
    finishReason: "mock",
  }
}
