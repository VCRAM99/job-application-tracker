import { describe, expect, it } from "vitest"

import { assertCloudExecution, DESKTOP_EXECUTION_AVAILABLE } from "@/lib/ai/executor"
import { aiFeaturesEnabled, jobAnalysisEnabled, jobAnalysisMockProvider, managedAllowance } from "@/lib/ai/flags"
import { AiRequestError } from "@/lib/ai/types"

describe("AI feature flags", () => {
  it("keeps desktop execution unavailable", () => {
    expect(DESKTOP_EXECUTION_AVAILABLE).toBe(false)
    expect(() => assertCloudExecution({ kind: "desktop" })).toThrow(AiRequestError)
    expect(
      assertCloudExecution({
        kind: "cloud",
        mode: "byok",
        provider: "openai",
        model: "gpt-5.4-mini",
      }).kind,
    ).toBe("cloud")
  })

  it("stays off in production unless explicitly enabled", () => {
    expect(aiFeaturesEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe(false)
    expect(aiFeaturesEnabled({ NODE_ENV: "production" })).toBe(false)
    expect(
      aiFeaturesEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        AI_FEATURES_ENABLED: "true",
      }),
    ).toBe(true)
    expect(aiFeaturesEnabled({ NODE_ENV: "development", AI_FEATURES_ENABLED: "false" })).toBe(false)
  })

  it("keeps job analysis off unless it is explicitly true and career AI is on", () => {
    expect(jobAnalysisEnabled({ NODE_ENV: "development" })).toBe(false)
    expect(jobAnalysisEnabled({ NODE_ENV: "development", JOB_ANALYSIS_ENABLED: "yes" })).toBe(false)
    expect(jobAnalysisEnabled({ NODE_ENV: "development", JOB_ANALYSIS_ENABLED: "1" })).toBe(false)
    expect(jobAnalysisEnabled({ NODE_ENV: "development", JOB_ANALYSIS_ENABLED: "true" })).toBe(true)
    expect(
      jobAnalysisEnabled({
        NODE_ENV: "development",
        JOB_ANALYSIS_ENABLED: "true",
        AI_FEATURES_ENABLED: "false",
      }),
    ).toBe(false)
    expect(
      jobAnalysisEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        JOB_ANALYSIS_ENABLED: "true",
      }),
    ).toBe(false)
    expect(
      jobAnalysisEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        JOB_ANALYSIS_ENABLED: "true",
        AI_FEATURES_ENABLED: "true",
      }),
    ).toBe(true)
    expect(jobAnalysisMockProvider({ NODE_ENV: "development", JOB_ANALYSIS_MOCK_PROVIDER: "true" })).toBe(true)
    expect(jobAnalysisMockProvider({ NODE_ENV: "development" })).toBe(false)
  })

  it.each([
    { NODE_ENV: "development", VERCEL_ENV: undefined, expected: true },
    { NODE_ENV: "test", VERCEL_ENV: undefined, expected: true },
    { NODE_ENV: "development", VERCEL_ENV: "development", expected: true },
    { NODE_ENV: "production", VERCEL_ENV: undefined, expected: false },
    { NODE_ENV: "production", VERCEL_ENV: "development", expected: false },
    { NODE_ENV: "production", VERCEL_ENV: "preview", expected: false },
    { NODE_ENV: "production", VERCEL_ENV: "production", expected: false },
    { NODE_ENV: "development", VERCEL_ENV: "preview", expected: false },
    { NODE_ENV: "development", VERCEL_ENV: "production", expected: false },
    { NODE_ENV: "development", VERCEL_ENV: "staging", expected: false },
  ])("mock provider with NODE_ENV=$NODE_ENV VERCEL_ENV=$VERCEL_ENV is $expected", ({ expected, ...env }) => {
    expect(jobAnalysisMockProvider({ ...env, JOB_ANALYSIS_MOCK_PROVIDER: "true" })).toBe(expected)
  })

  it("keeps managed AI off until the operator sets positive limits", () => {
    expect(managedAllowance({}).enabled).toBe(false)
    expect(
      managedAllowance({
        AI_MANAGED_ENABLED: "true",
        AI_MANAGED_MONTHLY_REQUEST_LIMIT: "0",
        AI_MANAGED_MONTHLY_TOKEN_LIMIT: "10",
      }).enabled,
    ).toBe(false)
    expect(
      managedAllowance({
        AI_MANAGED_ENABLED: "true",
        AI_MANAGED_MONTHLY_REQUEST_LIMIT: "20",
        AI_MANAGED_MONTHLY_TOKEN_LIMIT: "1000",
      }),
    ).toEqual({ enabled: true, requestLimit: 20, tokenLimit: 1000 })
  })
})
