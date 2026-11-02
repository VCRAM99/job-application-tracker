import { describe, expect, it } from "vitest"

import type { VerifiedFact } from "@/lib/analyze/types"
import {
  checkRewrite,
  checkSentence,
  fitToLimit,
  FORMAT_LIMITS,
  groundQuote,
  keepVerifiedFactIds,
  mentionsScore,
  newNumbers,
  splitSentences,
} from "@/lib/ai/verify"
import * as resumeNumbers from "@/lib/resume/numbers"
import * as tailor from "@/lib/resume/tailor"

const fact = (id: string, type: VerifiedFact["type"], title: string, detail = "", evidence: string | null = null): VerifiedFact => ({
  id,
  type,
  title,
  detail,
  evidence,
  updatedAt: "2026-10-01T00:00:00.000Z",
  startDate: type === "employment" ? "2021-01-01" : null,
  endDate: null,
})

const ROLE = "Backend Engineer \n Lumen Ridge Labs \n Cut p95 checkout latency by 40% by moving fraud checks to an async queue."
const JOB = { context: ["Northwind Analytics", "Staff Platform Engineer", "Dana Reyes", "Recruiter"], contextTitles: ["Staff Platform Engineer", "Recruiter"] }

describe("shared verifier: M4 compatibility", () => {
  it("re-exports the moved M4 checks unchanged", () => {
    expect(tailor.checkRewrite).toBe(checkRewrite)
    expect(resumeNumbers.newNumbers).toBe(newNumbers)
  })

  it("keeps M4 checkRewrite decisions", () => {
    const before = "Cut p95 checkout latency by 40% by moving fraud checks to an async queue."
    expect(checkRewrite(before, "Reduced p95 checkout latency by 40% with an async fraud queue.", [])).toBeNull()
    expect(checkRewrite(before, "Reduced p95 checkout latency by 45% with an async fraud queue.", [])).toBe("new_number")
    expect(checkRewrite(before, "Reduced p95 latency by 40% at Google with an async queue.", [])).toBe("new_name")
    expect(checkRewrite(before, "As senior lead, cut p95 latency by 40% with an async queue.", [])).toBe("new_title")
    expect(checkRewrite(before, "Cut p95 latency by 40%, earning an AWS certification.", [])).toBe("new_credential")
  })
})

describe("checkSentence", () => {
  const evidence = [ROLE]

  it("passes a sentence grounded in a cited fact", () => {
    expect(checkSentence("I cut p95 checkout latency by 40% at Lumen Ridge Labs.", { evidence, ...JOB })).toBeNull()
  })

  it("drops a new metric, year, or month even when the job text contains it", () => {
    const policy = { evidence, context: [...JOB.context, "5+ years", "45% growth", "since 2019", "March"], contextTitles: JOB.contextTitles }
    expect(checkSentence("I cut checkout latency by 45%.", policy)).toBe("new_number")
    expect(checkSentence("I have 5 years of platform work.", policy)).toBe("new_number")
    expect(checkSentence("I have led platform work since 2019.", policy)).toBe("new_number")
    expect(checkSentence("I started that work in March.", policy)).toBe("new_number")
  })

  it("drops a new credential even when the job asks for it", () => {
    const policy = { evidence, context: ["PhD preferred", "AWS Certified Solutions Architect"] }
    expect(checkSentence("I hold a PhD in distributed systems.", policy)).toBe("new_credential")
    expect(checkSentence("I am AWS certified.", policy)).toBe("new_credential")
  })

  it("allows the job title only as the role, never as the user's own title", () => {
    expect(checkSentence("I am excited about the Staff Platform Engineer role.", { evidence, ...JOB })).toBeNull()
    expect(checkSentence("Thanks for sharing the Staff Platform Engineer opening.", { evidence, ...JOB })).toBeNull()
    expect(checkSentence("I am a Staff Platform Engineer.", { evidence, ...JOB })).toBe("new_title")
    expect(checkSentence("As a staff engineer I cut checkout latency by 40%.", { evidence, ...JOB })).toBe("new_title")
    expect(checkSentence("I was promoted to principal last spring.", { evidence, ...JOB })).not.toBeNull()
  })

  it("allows context names but never as the user's employer", () => {
    expect(checkSentence("Hi Dana, I enjoyed reading about Northwind Analytics.", { evidence, ...JOB })).toBeNull()
    expect(checkSentence("I worked at Northwind Analytics for a while.", { evidence, ...JOB })).toBe("new_name")
    expect(checkSentence("While at Northwind Analytics I cut checkout latency by 40%.", { evidence, ...JOB })).toBe("new_name")
    expect(checkSentence("At Northwind Analytics, I cut checkout latency by 40%.", { evidence, ...JOB })).toBe("new_name")
    expect(checkSentence("I worked at Lumen Ridge Labs.", { evidence, ...JOB })).toBeNull()
  })

  it("drops a name that is in no source", () => {
    expect(checkSentence("I partnered with Stripe on payments.", { evidence, ...JOB })).toBe("new_name")
    expect(checkSentence("Zephyrcorp hired me for payments.", { evidence, ...JOB })).toBe("new_name")
    expect(checkSentence("I deployed kubernetes clusters.", { evidence, ...JOB })).toBe("new_name")
  })

  it("lets interview questions draw on the job text", () => {
    const policy = { evidence: [], context: ["5+ years of Go and Kubernetes", "Northwind Analytics"], contextIsEvidence: true }
    expect(checkSentence("How have you used Go and Kubernetes over 5+ years?", policy)).toBeNull()
    expect(checkSentence("How did you run Kafka at 10x scale?", policy)).not.toBeNull()
  })
})

describe("splitSentences, mentionsScore, and limits", () => {
  it("splits on sentence ends and line breaks", () => {
    expect(splitSentences("Hi Dana. Thanks!\nBest")).toEqual(["Hi Dana.", "Thanks!", "Best"])
  })

  it("flags any rating language", () => {
    for (const text of ["7/10 overall", "I'd rate this 4 out of 5", "Strong score", "Rated highly", "grade: B"]) expect(mentionsScore(text)).toBe(true)
    expect(mentionsScore("Lead with the outcome, then the steps you took.")).toBe(false)
  })

  it("drops trailing sentences until the body fits the cap", () => {
    const sentences = Array.from({ length: 10 }, (_, index) => ({ text: `Sentence ${index} ${"x".repeat(40)}.`, paragraphEnd: index === 4 }))
    const fitted = fitToLimit(sentences, FORMAT_LIMITS.connection_note)
    expect(fitted.body.length).toBeLessThanOrEqual(300)
    expect(fitted.kept + fitted.dropped).toBe(10)
    expect(fitted.dropped).toBeGreaterThan(0)
    expect(FORMAT_LIMITS).toEqual({ connection_note: 300, message: 1200, email: 2500, answer: 2500 })
    expect(fitToLimit(sentences.slice(0, 6), 5000).body).toContain(".\n\nSentence 5")
  })
})

describe("fact ids and grounding", () => {
  it("keeps only known verified fact ids", () => {
    const facts = [fact("f1", "skill", "Go"), fact("f2", "employment", "Engineer", "Lumen")]
    expect(keepVerifiedFactIds(["f1", "f9", "f1", "f2"], facts)).toEqual({ ids: ["f1", "f2"], dropped: 1 })
  })

  it("grounds a quote only when it appears in the source", () => {
    const source = "Northwind   Analytics builds “privacy-first” dashboards for clinics — founded in Oslo."
    expect(groundQuote(source, "builds \"privacy-first\" dashboards for clinics")).not.toBeNull()
    expect(groundQuote(source, "NORTHWIND ANALYTICS BUILDS")).not.toBeNull()
    expect(groundQuote(source, "builds dashboards for hospitals")).toBeNull()
    expect(groundQuote(source, "short")).toBeNull()
  })
})
