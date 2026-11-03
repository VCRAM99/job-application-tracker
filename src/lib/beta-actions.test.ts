import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * A user who is not on BETA_USER_IDS cannot reach V2 through a server action, even with every
 * feature flag on and a direct call. Each action returns its "off" result before touching AI,
 * Storage, or the database.
 */
const USER = "22222222-2222-4222-8222-222222222222"
const createClient = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: USER, email: null })),
  getCurrentUser: vi.fn(async () => ({ id: USER, email: null })),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient }))

beforeEach(() => {
  createClient.mockReset()
  vi.stubEnv("AI_FEATURES_ENABLED", "true")
  vi.stubEnv("JOB_ANALYSIS_ENABLED", "true")
  vi.stubEnv("RESUME_STUDIO_ENABLED", "true")
  vi.stubEnv("CAREER_COACH_ENABLED", "true")
  vi.stubEnv("JOB_RECOMMENDATIONS_ENABLED", "true")
  vi.stubEnv("BETA_USER_IDS", "11111111-1111-4111-8111-111111111111")
  vi.stubEnv("VERCEL_ENV", "production")
})

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const idle = { status: "idle" as const, message: null, fieldErrors: {} }

describe("V2 server actions for a user not on the beta list", () => {
  it("coach: generating questions and drafting are refused", async () => {
    const { generateQuestionSet } = await import("@/lib/coach/actions")
    const { createDraft } = await import("@/lib/coach/draft-actions")
    expect((await generateQuestionSet(idle, form({ analysisId: "33333333-3333-4333-8333-333333333333" }))).status).toBe("error")
    expect((await createDraft(idle, form({ kind: "follow_up", format: "email" }))).status).toBe("error")
    expect(createClient).not.toHaveBeenCalled()
  })

  it("career: saving the profile and AI settings is refused", async () => {
    const { saveCareerProfile } = await import("@/lib/career/actions")
    const { saveAiSettings } = await import("@/lib/career/settings-actions")
    expect((await saveCareerProfile(idle, form({ summary: "x" }))).status).toBe("error")
    expect((await saveAiSettings(idle, form({ executionMode: "byok", provider: "google" }))).status).toBe("error")
    expect(createClient).not.toHaveBeenCalled()
  })

  it("jobs: saving a job is refused", async () => {
    const { saveJob } = await import("@/lib/jobs/actions")
    expect((await saveJob({ status: "idle", message: null }, form({ postingId: "33333333-3333-4333-8333-333333333333" }))).status).toBe("error")
    expect(createClient).not.toHaveBeenCalled()
  })
})
