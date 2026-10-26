import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AnalysisResult } from "@/components/analyze/result"
import { CONFIRM_NOTE, QUALIFICATION_DISCLAIMER } from "@/lib/analyze/copy"
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

  it("shows work authorization as a neutral item to confirm, not a blocker or learning gap", () => {
    render(
      <AnalysisResult
        analysis={{
          ...analysis,
          requirements: [
            {
              id: "req-0",
              text: "Authorized to work in Canada",
              kind: "required",
              category: "work_authorization_location",
              normalizedSkills: [],
              minYears: null,
              evidenceQuote: "Required: TypeScript",
              spanStart: 0,
              spanEnd: 20,
            },
          ],
          matches: [
            {
              requirementId: "req-0",
              status: "not_evidenced",
              factIds: [],
              rationale: "No verified fact.",
              method: "ai",
              blocker: null,
            },
          ],
        }}
        factLabels={{}}
        executionMode="byok"
        reused={false}
      />,
    )
    expect(screen.getByText("Confirm before applying")).toBeTruthy()
    expect(screen.getByText(CONFIRM_NOTE)).toBeTruthy()
    expect(screen.getByRole("cell", { name: "Confirm" })).toBeTruthy()
    expect(screen.queryByText("Not evidenced")).toBeNull()
    expect(screen.getByText("No blocker was recorded.")).toBeTruthy()
    expect(screen.getByText("No not-evidenced requirements are waiting for a suggestion.")).toBeTruthy()
  })
})
