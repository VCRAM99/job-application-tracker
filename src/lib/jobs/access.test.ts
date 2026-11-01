import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { getCurrentUser, requireUser, createClient } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(),
  createClient: vi.fn(),
}))
vi.mock("@/lib/auth/session", () => ({ getCurrentUser, requireUser }))
vi.mock("@/lib/supabase/server", () => ({ createClient }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { recommendedJobsAllowed } from "@/lib/jobs/access"
import { saveJob } from "@/lib/jobs/actions"
import { linkedApplicationId, loadTrackerPosting, searchJobs } from "@/lib/jobs/data"
import { recommendedJobsAllowedFor, recommendedJobsAllowlist } from "@/lib/jobs/flags"

const ADA = "11111111-1111-4111-8111-111111111111"
const GRACE = "22222222-2222-4222-8222-222222222222"
const POSTING = "33333333-3333-4333-8333-333333333333"

describe("recommended jobs allowlist", () => {
  it("keeps existing behavior when unset or blank", () => {
    expect(recommendedJobsAllowlist({})).toEqual({ mode: "everyone" })
    expect(recommendedJobsAllowlist({ JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: "  " })).toEqual({ mode: "everyone" })
    expect(recommendedJobsAllowedFor(GRACE, { JOB_RECOMMENDATIONS_ENABLED: "true" })).toBe(true)
    expect(recommendedJobsAllowedFor(GRACE, { JOB_RECOMMENDATIONS_ENABLED: "false" })).toBe(false)
  })

  it("allows only listed ids when set, case-insensitively, and still needs the flag", () => {
    const env = { JOB_RECOMMENDATIONS_ENABLED: "true", JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: ` ${ADA.toUpperCase()} , ` }
    expect(recommendedJobsAllowedFor(ADA, env)).toBe(true)
    expect(recommendedJobsAllowedFor(GRACE, env)).toBe(false)
    expect(recommendedJobsAllowedFor(null, env)).toBe(false)
    expect(recommendedJobsAllowedFor(ADA, { ...env, JOB_RECOMMENDATIONS_ENABLED: "false" })).toBe(false)
  })

  it("closes the section to everyone when an entry is malformed", () => {
    for (const value of [`${ADA},not-a-uuid`, ",", `${ADA};${GRACE}`]) {
      const env = { JOB_RECOMMENDATIONS_ENABLED: "true", JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: value }
      expect(recommendedJobsAllowlist(env)).toEqual({ mode: "nobody" })
      expect(recommendedJobsAllowedFor(ADA, env)).toBe(false)
    }
  })
})

describe("recommended jobs gate on the server", () => {
  beforeEach(() => {
    vi.stubEnv("JOB_RECOMMENDATIONS_ENABLED", "true")
    vi.stubEnv("JOB_RECOMMENDATIONS_ALLOWED_USER_IDS", ADA)
    getCurrentUser.mockReset()
    requireUser.mockReset()
    createClient.mockReset()
  })
  afterEach(() => vi.unstubAllEnvs())

  it("lets a listed user through and checks the session only when a list is set", async () => {
    getCurrentUser.mockResolvedValue({ id: ADA, email: null })
    await expect(recommendedJobsAllowed()).resolves.toBe(true)
    vi.stubEnv("JOB_RECOMMENDATIONS_ALLOWED_USER_IDS", "")
    getCurrentUser.mockClear()
    await expect(recommendedJobsAllowed()).resolves.toBe(true)
    expect(getCurrentUser).not.toHaveBeenCalled()
  })

  it("shows the off state, rejects actions, and skips the tracker prefill for anyone else", async () => {
    getCurrentUser.mockResolvedValue({ id: GRACE, email: null })
    await expect(recommendedJobsAllowed()).resolves.toBe(false)
    await expect(searchJobs({} as Parameters<typeof searchJobs>[0])).resolves.toEqual({ ok: false, error: "disabled" })
    const form = new FormData()
    form.set("postingId", POSTING)
    await expect(saveJob({ status: "idle", message: null } as never, form)).resolves.toEqual({
      status: "error",
      message: "Recommended jobs are turned off.",
    })
    await expect(loadTrackerPosting(POSTING)).resolves.toEqual({ ok: false, error: "disabled" })
    await expect(linkedApplicationId(POSTING)).resolves.toBeNull()
    expect(createClient).not.toHaveBeenCalled()

    getCurrentUser.mockResolvedValue(null)
    await expect(recommendedJobsAllowed()).resolves.toBe(false)
  })
})
