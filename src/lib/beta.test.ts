import { describe, expect, it } from "vitest"

import { betaAllowedFor, betaAllowlist, jobsAllowedFor, v2AllowedFor } from "@/lib/beta"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const ALL_ON = {
  AI_FEATURES_ENABLED: "true",
  JOB_ANALYSIS_ENABLED: "true",
  RESUME_STUDIO_ENABLED: "true",
  CAREER_COACH_ENABLED: "true",
  JOB_RECOMMENDATIONS_ENABLED: "true",
}
const FEATURES = ["jobs", "career", "analyze", "resumes", "coach"] as const

describe("BETA_USER_IDS", () => {
  it("lists ids, case-insensitively", () => {
    const env = { BETA_USER_IDS: ` ${A.toUpperCase()} , ` }
    expect(betaAllowlist(env)).toMatchObject({ mode: "listed" })
    expect(betaAllowedFor(A, env)).toBe(true)
    expect(betaAllowedFor(B, env)).toBe(false)
    expect(betaAllowedFor(null, env)).toBe(false)
  })

  it("closes to everyone when any entry is malformed", () => {
    for (const raw of [`${A},not-a-uuid`, `${A};${B}`, ","]) {
      expect(betaAllowlist({ BETA_USER_IDS: raw }).mode).toBe("nobody")
      expect(betaAllowedFor(A, { BETA_USER_IDS: raw })).toBe(false)
    }
  })

  it("unset is closed on any Vercel deployment and open locally", () => {
    expect(betaAllowlist({ VERCEL_ENV: "production" }).mode).toBe("nobody")
    expect(betaAllowlist({ VERCEL_ENV: "preview" }).mode).toBe("nobody")
    expect(betaAllowlist({ VERCEL_ENV: "production", BETA_USER_IDS: "  " }).mode).toBe("nobody")
    expect(betaAllowlist({}).mode).toBe("everyone")
  })

  it("gates every V2 feature for a non-listed user, even with every flag on", () => {
    const env = { ...ALL_ON, BETA_USER_IDS: A, VERCEL_ENV: "production" }
    for (const feature of FEATURES) {
      expect(v2AllowedFor(feature, A, env)).toBe(true)
      expect(v2AllowedFor(feature, B, env)).toBe(false)
      expect(v2AllowedFor(feature, null, env)).toBe(false)
    }
  })

  it("still needs each feature's own flag", () => {
    const env = { BETA_USER_IDS: A, VERCEL_ENV: "production", AI_FEATURES_ENABLED: "true" }
    expect(v2AllowedFor("career", A, env)).toBe(true)
    expect(v2AllowedFor("analyze", A, env)).toBe(false)
    expect(v2AllowedFor("resumes", A, env)).toBe(false)
    expect(v2AllowedFor("coach", A, env)).toBe(false)
    expect(v2AllowedFor("jobs", A, env)).toBe(false)
  })
})

describe('BETA_USER_IDS="*" (public launch)', () => {
  const prod = { ...ALL_ON, VERCEL_ENV: "production", BETA_USER_IDS: "*" }

  it("opens every V2 feature, including jobs, to every signed-in user", () => {
    expect(betaAllowlist(prod).mode).toBe("all-signed-in")
    expect(betaAllowlist({ ...prod, BETA_USER_IDS: "  *  " }).mode).toBe("all-signed-in")
    for (const user of [A, B]) {
      for (const feature of FEATURES) expect(v2AllowedFor(feature, user, prod)).toBe(true)
    }
  })

  it("never opens V2 to a signed-out request", () => {
    expect(betaAllowedFor(null, prod)).toBe(false)
    for (const feature of FEATURES) expect(v2AllowedFor(feature, null, prod)).toBe(false)
  })

  it("treats * mixed with ids as malformed, which closes V2", () => {
    for (const raw of [`*,${A}`, `${A},*`, "*,*", "**", "* ,", "all"]) {
      expect(betaAllowlist({ ...prod, BETA_USER_IDS: raw }).mode).toBe("nobody")
      expect(v2AllowedFor("career", A, { ...prod, BETA_USER_IDS: raw })).toBe(false)
      expect(jobsAllowedFor(A, { ...prod, BETA_USER_IDS: raw })).toBe(false)
    }
  })

  it("keeps unset closed on Vercel and still needs each feature's flag", () => {
    expect(v2AllowedFor("career", A, { ...prod, BETA_USER_IDS: "" })).toBe(false)
    expect(v2AllowedFor("coach", A, { ...prod, CAREER_COACH_ENABLED: "false" })).toBe(false)
    expect(jobsAllowedFor(A, { ...prod, JOB_RECOMMENDATIONS_ENABLED: "false" })).toBe(false)
  })

  it("lets JOB_RECOMMENDATIONS_ALLOWED_USER_IDS only narrow jobs", () => {
    const narrowed = { ...prod, JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: A }
    expect(jobsAllowedFor(A, narrowed)).toBe(true)
    expect(jobsAllowedFor(B, narrowed)).toBe(false)
    // The alias narrows jobs only; the AI features stay open to everyone signed in.
    expect(v2AllowedFor("analyze", B, narrowed)).toBe(true)
    expect(jobsAllowedFor(B, { ...prod, JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: "nope" })).toBe(false)
  })
})

describe("jobs access and the JOB_RECOMMENDATIONS_ALLOWED_USER_IDS alias", () => {
  const prod = { JOB_RECOMMENDATIONS_ENABLED: "true", VERCEL_ENV: "production" }

  it("keeps today's production setup: alias only, BETA_USER_IDS unset", () => {
    const env = { ...prod, JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: A }
    expect(jobsAllowedFor(A, env)).toBe(true)
    expect(jobsAllowedFor(B, env)).toBe(false)
    // AI features stay closed in the same setup.
    expect(v2AllowedFor("career", A, { ...env, AI_FEATURES_ENABLED: "true" })).toBe(false)
  })

  it("allows a user on either list once BETA_USER_IDS is set", () => {
    const env = { ...prod, JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: A, BETA_USER_IDS: B }
    expect(jobsAllowedFor(A, env)).toBe(true)
    expect(jobsAllowedFor(B, env)).toBe(true)
    expect(jobsAllowedFor("33333333-3333-4333-8333-333333333333", env)).toBe(false)
  })

  it("closes jobs when either list is malformed", () => {
    expect(jobsAllowedFor(A, { ...prod, JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: "nope" })).toBe(false)
    expect(jobsAllowedFor(A, { ...prod, JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: A, BETA_USER_IDS: "nope" })).toBe(false)
    expect(jobsAllowedFor(A, { ...prod, JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: "nope", BETA_USER_IDS: A })).toBe(false)
  })

  it("is off without the jobs flag, whatever the lists say", () => {
    expect(jobsAllowedFor(A, { BETA_USER_IDS: A, JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: A, VERCEL_ENV: "production" })).toBe(false)
  })
})
