import { describe, expect, it } from "vitest"

import { resumeStudioEnabled } from "@/lib/resume/flags"

describe("resume studio flag", () => {
  it.each([
    [{}, false],
    [{ RESUME_STUDIO_ENABLED: "true" }, true],
    [{ RESUME_STUDIO_ENABLED: " TRUE " }, true],
    [{ RESUME_STUDIO_ENABLED: "1" }, false],
    [{ RESUME_STUDIO_ENABLED: "yes" }, false],
    [{ RESUME_STUDIO_ENABLED: "true", AI_FEATURES_ENABLED: "false" }, false],
    [{ RESUME_STUDIO_ENABLED: "true", VERCEL_ENV: "production" }, false],
    [{ RESUME_STUDIO_ENABLED: "true", VERCEL_ENV: "production", AI_FEATURES_ENABLED: "true" }, true],
  ])("%j → %s", (env, expected) => {
    expect(resumeStudioEnabled(env)).toBe(expected)
  })
})
