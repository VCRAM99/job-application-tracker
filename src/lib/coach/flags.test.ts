import { describe, expect, it } from "vitest"

import { careerCoachEnabled } from "@/lib/coach/flags"

describe("careerCoachEnabled", () => {
  it.each([
    [{}, false],
    [{ CAREER_COACH_ENABLED: "true" }, true],
    [{ CAREER_COACH_ENABLED: " TRUE " }, true],
    [{ CAREER_COACH_ENABLED: "1" }, false],
    [{ CAREER_COACH_ENABLED: "yes" }, false],
    [{ CAREER_COACH_ENABLED: "true", AI_FEATURES_ENABLED: "false" }, false],
    [{ CAREER_COACH_ENABLED: "true", VERCEL_ENV: "production" }, false],
    [{ CAREER_COACH_ENABLED: "true", VERCEL_ENV: "production", AI_FEATURES_ENABLED: "true" }, true],
    [{ VERCEL_ENV: "production", AI_FEATURES_ENABLED: "true" }, false],
  ])("%j → %s", (env, expected) => {
    expect(careerCoachEnabled(env as Record<string, string>)).toBe(expected)
  })
})
