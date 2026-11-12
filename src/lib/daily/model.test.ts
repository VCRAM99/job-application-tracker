import { describe, expect, it } from "vitest"

import { dailyReducer, type DailyState } from "@/components/daily/store"
import { checklistFor, completionKey, EXTEND_DAYS, inWindow, initialRange, mergeWindow, PREFETCH_MARGIN_DAYS, rangeToLoad, type DailyWindow } from "@/lib/daily/model"
import { addCalendarDays } from "@/lib/records/logic"

const empty = (from: string, to: string): DailyWindow => ({ from, to, completions: [], food: [], water: [], sleep: [], steps: [], weight: [] })

describe("daily window", () => {
  it("starts 90 days back and 14 ahead of today", () => {
    expect(initialRange("2026-11-12")).toEqual({ from: "2026-08-14", to: "2026-11-26" })
  })

  it("loads nothing while the day and its margin are inside the window", () => {
    const window = initialRange("2026-11-12")
    expect(rangeToLoad(window, "2026-11-12")).toBeNull()
    expect(rangeToLoad(window, addCalendarDays(window.to, -PREFETCH_MARGIN_DAYS))).toBeNull()
  })

  it("extends the touching edge before the user reaches it", () => {
    const window = initialRange("2026-11-12")
    const ahead = rangeToLoad(window, addCalendarDays(window.to, -PREFETCH_MARGIN_DAYS + 1))
    expect(ahead).toEqual({ from: addCalendarDays(window.to, 1), to: addCalendarDays(window.to, EXTEND_DAYS) })
    const behind = rangeToLoad(window, addCalendarDays(window.from, 3))
    expect(behind).toEqual({ from: addCalendarDays(window.from, -EXTEND_DAYS), to: addCalendarDays(window.from, -1) })
  })

  it("loads around a far calendar jump instead of everything in between", () => {
    const window = initialRange("2026-11-12")
    expect(rangeToLoad(window, "2024-01-15")).toEqual({ from: addCalendarDays("2024-01-15", -EXTEND_DAYS), to: addCalendarDays("2024-01-15", EXTEND_DAYS) })
  })

  it("merges touching ranges, keeps the newest copy of a row, and replaces a far range", () => {
    const left = { ...empty("2026-10-01", "2026-10-31"), completions: ["t:2026-10-05"], water: [{ id: "a", date: "2026-10-05", amount: 250 }] }
    const right = { ...empty("2026-11-01", "2026-11-30"), completions: ["t:2026-11-02"], water: [{ id: "a", date: "2026-10-05", amount: 500 }] }
    const merged = mergeWindow(left, right)
    expect([merged.from, merged.to]).toEqual(["2026-10-01", "2026-11-30"])
    expect(merged.completions.sort()).toEqual(["t:2026-10-05", "t:2026-11-02"])
    expect(merged.water).toEqual([{ id: "a", date: "2026-10-05", amount: 500 }])
    expect(mergeWindow(left, empty("2025-01-01", "2025-01-31")).from).toBe("2025-01-01")
    expect(inWindow(merged, "2026-12-01")).toBe(false)
  })
})

describe("daily reducer (optimistic replays)", () => {
  const state: DailyState = {
    tasks: [{ id: "t", title: "Stretch", description: null, weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: null, endDate: null, status: "active" }],
    goals: { calorieTarget: null, proteinTarget: null, waterGoalMl: null, waterIncrementMl: 250, sleepTargetMinutes: null, stepTarget: null, weightUnit: "kg", goalMode: "bulk", proteinDirection: "follow", hiddenMetrics: [] },
    window: empty("2026-11-01", "2026-11-30"),
  }

  it("applies a completion idempotently", () => {
    const action = { type: "completion" as const, key: completionKey("t", "2026-11-12"), done: true }
    const once = dailyReducer(state, action)
    expect(dailyReducer(once, action)).toBe(once)
    expect(checklistFor(once.tasks, new Set(once.window.completions), "2026-11-12", "2026-11-12")[0]?.completed).toBe(true)
  })

  it("replaces the pending row with the saved one, even if both are applied", () => {
    const pending = dailyReducer(state, { type: "upsert", kind: "water", row: { id: "pending-1", date: "2026-11-12", amount: 250 } })
    const saved = { type: "upsert" as const, kind: "water" as const, row: { id: "real-1", date: "2026-11-12", amount: 250 }, replaces: "pending-1" }
    const confirmed = dailyReducer(pending, saved)
    expect(confirmed.window.water).toEqual([{ id: "real-1", date: "2026-11-12", amount: 250 }])
    expect(dailyReducer(confirmed, saved).window.water).toHaveLength(1)
  })

  it("removes a row and keeps others", () => {
    const two = dailyReducer(dailyReducer(state, { type: "upsert", kind: "steps", row: { id: "a", date: "2026-11-12", amount: 1000 } }), { type: "upsert", kind: "steps", row: { id: "b", date: "2026-11-12", amount: 2000 } })
    expect(dailyReducer(two, { type: "remove", kind: "steps", id: "a" }).window.steps.map((row) => row.id)).toEqual(["b"])
  })
})
