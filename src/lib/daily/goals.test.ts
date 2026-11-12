import { describe, expect, it } from "vitest"

import {
  CLOSE_RATIO,
  calorieDirection,
  DEFAULT_GOAL_MODE,
  parseGoalMode,
  parseHiddenMetrics,
  parseProteinDirection,
  proteinDirection,
  targetStatus,
} from "@/lib/daily/goals"
import { goalsFromRow } from "@/lib/daily/data"

const at = (ratio: number, direction: "limit" | "reach") => targetStatus(ratio * 2000, 2000, direction)

describe("target status at the exact thresholds", () => {
  it("reads a calorie limit (cutting): under, close from 90% through 100%, over above 100%", () => {
    expect(CLOSE_RATIO).toBe(0.9)
    expect(at(0, "limit")).toMatchObject({ tone: "good", label: "Under" })
    expect(at(0.8995, "limit")).toMatchObject({ tone: "good", label: "Under" })
    expect(at(0.9, "limit")).toMatchObject({ tone: "close", label: "Close" })
    expect(at(1, "limit")).toMatchObject({ tone: "close", label: "Close" })
    expect(at(1.0005, "limit")).toMatchObject({ tone: "over", label: "Over" })
  })

  it("reads an amount to reach (bulking, always-reach protein): below, close from 90%, reached at 100%", () => {
    expect(at(0, "reach")).toMatchObject({ tone: "below", label: "Below" })
    expect(at(0.8995, "reach")).toMatchObject({ tone: "below", label: "Below" })
    expect(at(0.9, "reach")).toMatchObject({ tone: "close", label: "Close" })
    expect(at(0.9995, "reach")).toMatchObject({ tone: "close", label: "Close" })
    expect(at(1, "reach")).toMatchObject({ tone: "good", label: "Reached" })
    expect(at(1.5, "reach")).toMatchObject({ tone: "good", label: "Reached" })
  })

  it("shows nothing without a positive target", () => {
    for (const target of [null, 0, -5, Number.NaN]) expect(targetStatus(100, target, "limit")).toEqual({ tone: "none", label: "No target", ratio: null })
  })

  it("treats a negative total as zero", () => {
    expect(targetStatus(-50, 2000, "limit")).toMatchObject({ tone: "good", ratio: 0 })
  })
})

describe("goal mode and protein direction", () => {
  it("makes calories a limit when cutting and an amount to reach when bulking", () => {
    expect(calorieDirection("cut")).toBe("limit")
    expect(calorieDirection("bulk")).toBe("reach")
  })

  it("makes protein follow the goal mode unless it is set to always reach", () => {
    expect(proteinDirection("cut", "follow")).toBe("limit")
    expect(proteinDirection("bulk", "follow")).toBe("reach")
    expect(proteinDirection("cut", "reach")).toBe("reach")
    expect(proteinDirection("bulk", "reach")).toBe("reach")
  })
})

describe("defaults for existing users", () => {
  it("keeps today's behavior when nothing is saved: bulking, protein follows, nothing hidden", () => {
    expect(DEFAULT_GOAL_MODE).toBe("bulk")
    expect(goalsFromRow(null)).toEqual({
      calorieTarget: null,
      proteinTarget: null,
      waterGoalMl: null,
      waterIncrementMl: 250,
      sleepTargetMinutes: null,
      stepTarget: null,
      weightUnit: "kg",
      goalMode: "bulk",
      proteinDirection: "follow",
      hiddenMetrics: [],
    })
  })

  it("reads a row saved before the migration (new columns null) with its targets intact", () => {
    const goals = goalsFromRow({ calorie_target: 2200, protein_target: "160.5", water_goal_ml: 3000, water_increment_ml: 300, sleep_target_minutes: 450, step_target: 9000, weight_unit: "lb", goal_mode: null, protein_direction: null, hidden_metrics: null })
    expect(goals).toMatchObject({ calorieTarget: 2200, proteinTarget: 160.5, waterIncrementMl: 300, weightUnit: "lb", goalMode: "bulk", proteinDirection: "follow", hiddenMetrics: [] })
  })

  it("ignores unknown values instead of failing", () => {
    expect(parseGoalMode("maintain")).toBe("bulk")
    expect(parseProteinDirection(42)).toBe("follow")
    expect(parseHiddenMetrics(["sleep", "mood", "sleep", "food"])).toEqual(["food", "sleep"])
    expect(parseHiddenMetrics("sleep")).toEqual([])
  })
})
