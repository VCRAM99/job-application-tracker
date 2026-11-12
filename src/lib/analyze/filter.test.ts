import { describe, expect, it } from "vitest"

import { isBoilerplateQuote, isDuplicateRequirement } from "@/lib/analyze/filter"
import { groundRequirements } from "@/lib/analyze/ground"
import { normalizeJobText } from "@/lib/analyze/text"
import type { RawRequirement } from "@/lib/analyze/types"

const requirement = (overrides: Partial<RawRequirement>): RawRequirement => ({
  text: "",
  kind: "required",
  category: "skill",
  normalizedSkills: [],
  minYears: null,
  evidenceQuote: "",
  ...overrides,
})

describe("isBoilerplateQuote", () => {
  it.each([
    "Quarry Lane Health is an equal opportunity employer.",
    "This posting is fictional and is not an offer of employment.",
    "If you need an accommodation during the interview process, email our recruiting team.",
    "Compensation: $150,000 – $175,000 USD per year, plus equity.",
    "Salary range: €95,000–€115,000.",
    "Pay: $28–$32 per hour.",
    "Benefits include unlimited PTO, a home-office stipend, parental leave, and an annual offsite.",
    "What we offer: shift differential, free bread, paid holidays, and a 401(k) match.",
    "To apply, send a resume.",
  ])("drops %s", (quote) => {
    expect(isBoilerplateQuote(quote)).toBe(true)
  })

  it.each([
    "5+ years of professional backend development.",
    "Experience with healthcare data or HIPAA.",
    "You must be authorized to work in the United States; we cannot sponsor visas for this role.",
    "Comfort with SQL to answer your own questions.",
    "At least 2 years managing payments, billing, or other financial products.",
    "Experience with card network rules or PCI DSS.",
    "A current food safety certification (for example, ServSafe or equivalent).",
    "Location: hybrid, three days a week in our fictional Lisbon office.",
    "A background check is required before the start date.",
  ])("keeps %s", (quote) => {
    expect(isBoilerplateQuote(quote)).toBe(false)
  })
})

describe("isDuplicateRequirement", () => {
  const typescript = { text: "Strong TypeScript and Node.js", evidenceQuote: "Strong TypeScript and Node.js.", category: "skill", normalizedSkills: ["TypeScript", "Node.js"] }

  it("drops a repeated requirement", () => {
    expect(isDuplicateRequirement({ text: "Strong TypeScript skills are a must", evidenceQuote: "Strong TypeScript skills are a must for this role.", category: "skill", normalizedSkills: ["TypeScript"] }, [typescript])).toBe(true)
    expect(isDuplicateRequirement({ text: "6+ years of product management experience", evidenceQuote: "We're looking for 6+ years of product management experience." }, [{ text: "6+ years of product management experience", evidenceQuote: "6+ years of product management experience." }])).toBe(true)
    expect(isDuplicateRequirement({ text: "Strong SQL", evidenceQuote: "Strong SQL, including window functions." }, [{ text: "Strong SQL", evidenceQuote: "Strong SQL, including window functions." }])).toBe(true)
  })

  it("keeps separate requirements, including two from one line", () => {
    expect(isDuplicateRequirement({ text: "Node.js", evidenceQuote: "Node.js", category: "skill", normalizedSkills: ["Node.js", "Express"] }, [typescript])).toBe(false)
    expect(isDuplicateRequirement({ text: "Experience with Kafka", evidenceQuote: "Experience with Kafka." }, [{ text: "Experience with Apache Airflow", evidenceQuote: "Experience with Apache Airflow or a similar orchestrator." }])).toBe(false)
    expect(isDuplicateRequirement({ text: "TypeScript experience", evidenceQuote: "5 years of TypeScript", category: "experience_years", normalizedSkills: ["TypeScript"] }, [typescript])).toBe(false)
  })
})

describe("groundRequirements filters", () => {
  const jd = normalizeJobText(`Required: Strong SQL.
Again: strong SQL is essential.
Pay: $28–$32 per hour.
Fictional Co is an equal opportunity employer.`)

  it("drops boilerplate and repeats, keeps ids sequential, and still drops ungrounded quotes", () => {
    const result = groundRequirements(jd, [
      requirement({ text: "Strong SQL", evidenceQuote: "Strong SQL.", normalizedSkills: ["SQL"] }),
      requirement({ text: "Strong SQL is essential", evidenceQuote: "strong SQL is essential.", normalizedSkills: ["SQL"] }),
      requirement({ text: "Hourly pay", category: "other", evidenceQuote: "Pay: $28–$32 per hour." }),
      requirement({ text: "Equal opportunity", category: "other", evidenceQuote: "Fictional Co is an equal opportunity employer." }),
      requirement({ text: "PhD from MIT", category: "education", evidenceQuote: "A PhD from MIT is required." }),
    ])
    expect(result.kept.map((item) => [item.id, item.text])).toEqual([["req-0", "Strong SQL"]])
    expect(result.dropped).toBe(4)
  })
})
