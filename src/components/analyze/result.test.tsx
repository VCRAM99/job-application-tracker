import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AnalysisResult } from "@/components/analyze/result"
import { QUALIFICATION_DISCLAIMER } from "@/lib/analyze/copy"
import type { AnalysisRecord } from "@/lib/analyze/data"

const analysis: AnalysisRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  source: "pasted",
  title: "Backend Engineer",
  company: "Northwind Circuit",
  jdText: "Required: TypeScript services for a fictional team.",
  status: "complete",
  errorCode: null,
  score: 50,
  coverageConfidence: 2 / 3,
  breakdown: {
    score: 50,
    weightedSum: 2,
    weightedMax: 4,
    coverageConfidence: 2 / 3,
    scorableCount: 2,
    unclearCount: 1,
  },
  requirements: [
    {
      id: "req-0",
      text: "TypeScript",
      kind: "required",
      category: "skill",
      normalizedSkills: ["TypeScript"],
      minYears: null,
      evidenceQuote: "TypeScript",
      spanStart: 10,
      spanEnd: 20,
    },
  ],
  matches: [
    {
      requirementId: "req-0",
      status: "unclear",
      factIds: [],
      rationale: "Not enough verified facts.",
      method: "ai",
      blocker: null,
    },
  ],
  blockers: [],
  droppedRequirementCount: 1,
  claims: [],
  readability: null,
  provider: "google",
  model: "gemini-2.5-flash",
  executionMode: "byok",
  createdAt: "2026-10-23T00:00:00.000Z",
  postingId: null,
  applicationId: null,
  resumeSourceId: null,
}

describe("fit result", () => {
  it("shows the qualification match estimate and leaves unclear work out of the headline score", () => {
    render(
      <AnalysisResult
        analysis={analysis}
        factLabels={{}}
        executionMode="byok"
        reused={false}
      />,
    )
    expect(screen.getByText("50 / 100")).toBeTruthy()
    expect(screen.getByText(QUALIFICATION_DISCLAIMER)).toBeTruthy()
    expect(screen.getByText("Unclear")).toBeTruthy()
    expect(document.body.textContent ?? "").not.toMatch(/\bATS\b/i)
    expect(screen.getByRole("button", { name: "Re-check with your own key" })).toBeTruthy()
  })
})
