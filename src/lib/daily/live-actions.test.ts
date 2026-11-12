// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest"

const createClient = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", email: null })) }))
vi.mock("@/lib/supabase/server", () => ({ createClient }))

afterEach(() => createClient.mockReset())

const goals = { calorieTarget: 2000, proteinTarget: 150, waterGoalMl: 2000, waterIncrementMl: 250, sleepTargetMinutes: 480, stepTarget: 8000, weightUnit: "kg" as const, goalMode: "cut" as const, proteinDirection: "follow" as const, hiddenMetrics: [] }

describe("daily server actions: input checks", () => {
  it("refuses amounts outside the database limits before calling it", async () => {
    const { saveAmountEntry } = await import("@/lib/daily/live-actions")
    expect(await saveAmountEntry("water", { date: "2026-11-12", amount: 6000 })).toEqual({ ok: false, message: "Enter a whole number of milliliters, up to 5,000 at a time." })
    expect(await saveAmountEntry("sleep", { date: "2026-11-12", amount: 1441 })).toMatchObject({ ok: false })
    expect(await saveAmountEntry("steps", { date: "2026-11-12", amount: 1.5 })).toMatchObject({ ok: false })
    expect(createClient).not.toHaveBeenCalled()
  })

  it("only accepts its own table names, not inherited object keys", async () => {
    const { deleteHealthEntry, saveAmountEntry } = await import("@/lib/daily/live-actions")
    for (const kind of ["constructor", "toString", "__proto__", "users"]) {
      expect(await deleteHealthEntry(kind as never, "11111111-1111-4111-8111-111111111111")).toEqual({ ok: false, message: "That entry could not be deleted." })
      expect(await saveAmountEntry(kind as never, { date: "2026-11-12", amount: 5 })).toEqual({ ok: false, message: "That entry could not be saved." })
    }
    expect(createClient).not.toHaveBeenCalled()
  })

  it("names the target that is out of range", async () => {
    const { saveDailyPreferences } = await import("@/lib/daily/live-actions")
    expect(await saveDailyPreferences({ ...goals, sleepTargetMinutes: 0 })).toEqual({ ok: false, message: "Sleep target: 1 to 1,440 minutes." })
    expect(await saveDailyPreferences({ ...goals, waterIncrementMl: 6000 })).toEqual({ ok: false, message: "Water button: 1 to 5,000 mL." })
    expect(await saveDailyPreferences({ ...goals, hiddenMetrics: ["mood" as never] })).toEqual({ ok: false, message: "Unknown metric." })
  })

  it("explains a missing migration when the new columns are not there yet", async () => {
    const single = vi.fn(async () => ({ data: null, error: { code: "PGRST204", message: "Could not find the 'goal_mode' column" } }))
    createClient.mockResolvedValue({ from: () => ({ upsert: () => ({ select: () => ({ single }) }) }) })
    const { saveDailyPreferences } = await import("@/lib/daily/live-actions")
    expect(await saveDailyPreferences(goals)).toEqual({ ok: false, message: "Daily tasks are not available yet. Apply the latest migration, then reload." })
  })
})
