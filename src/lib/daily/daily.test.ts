import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  isScheduledOn,
  lastCompletedWeek,
  localDateInTimeZone,
  weekdayNumber,
  weeklyInsights,
} from "@/lib/daily/calendar"
import {
  canAddWater,
  displayToKg,
  kgToDisplay,
  normalizeSeries,
  pointsByDate,
  sleepMinutes,
  waterTotal,
} from "@/lib/daily/health"

const task = {
  id: "task-1",
  title: "Gym",
  weekdays: [1, 2, 3, 4, 5, 6],
  startDate: "2026-10-14",
  endDate: null,
  status: "active" as const,
}

describe("weekday recurrence and local dates", () => {
  it("treats Monday as weekday 1 from the calendar date", () => {
    expect(weekdayNumber("2026-10-19")).toBe(1)
    expect(weekdayNumber("2026-10-18")).toBe(7)
  })

  it("uses the IANA timezone instead of UTC midnight", () => {
    const instant = new Date("2026-10-20T03:30:00.000Z")
    expect(localDateInTimeZone(instant, "America/New_York")).toBe("2026-10-19")
    expect(localDateInTimeZone(instant, "UTC")).toBe("2026-10-20")
  })

  it("hides a paused task from today forward and keeps earlier days", () => {
    const paused = { ...task, status: "paused" as const }
    expect(isScheduledOn(paused, "2026-10-19", "2026-10-19")).toBe(false)
    expect(isScheduledOn(paused, "2026-10-16", "2026-10-19")).toBe(true)
  })

  it("respects the active date range", () => {
    expect(isScheduledOn(task, "2026-10-13", "2026-10-19")).toBe(false)
    expect(isScheduledOn({ ...task, endDate: "2026-10-16" }, "2026-10-19", "2026-10-19")).toBe(false)
  })
})

describe("weekly insights", () => {
  it("defaults to the most recently completed Monday–Sunday week", () => {
    expect(lastCompletedWeek("2026-10-19")).toEqual({ start: "2026-10-12", end: "2026-10-18" })
  })

  it("counts only scheduled days and keeps unmatched history out of both counts", () => {
    const week = { start: "2026-10-12", end: "2026-10-18" }
    const rows = weeklyInsights(
      [task],
      [
        { taskId: "task-1", localDate: "2026-10-14" },
        { taskId: "task-1", localDate: "2026-10-12" },
      ],
      week,
    )
    expect(rows).toEqual([{ taskId: "task-1", title: "Gym", completed: 1, scheduled: 4 }])
  })
})

describe("health calculations", () => {
  it("aggregates food-like totals, water, and sleep", () => {
    expect(waterTotal([250, 250, -250])).toBe(250)
    expect(canAddWater(250, -500)).toBe(false)
    expect(canAddWater(250, -250)).toBe(true)
    expect(sleepMinutes(8, 30)).toBe(510)
    expect(sleepMinutes(24, 1)).toBeNull()
    expect(sleepMinutes(0, 0)).toBeNull()
  })

  it("converts weight from the stored kilogram value", () => {
    expect(kgToDisplay(1, "lb")).toBe(2.2)
    expect(displayToKg(2.2, "lb")).toBeCloseTo(0.998, 2)
    expect(kgToDisplay(70.25, "kg")).toBe(70.3)
  })

  it("normalizes each series independently and leaves gaps", () => {
    expect(normalizeSeries([100, null, 200])).toEqual([0, null, 100])
    expect(normalizeSeries([4, 4])).toEqual([50, 50])
    expect(pointsByDate(["2026-10-18", "2026-10-19"], [{ date: "2026-10-19", value: 80 }])).toEqual([
      { date: "2026-10-18", value: null },
      { date: "2026-10-19", value: 80 },
    ])
  })
})

describe("health privacy migration", () => {
  const sql = readFileSync("supabase/migrations/20261019220000_daily_tasks_and_health.sql", "utf8")

  it("defaults health tracking off and scopes every table to the owner", () => {
    expect(sql).toContain("health_tracking_enabled boolean not null default false")
    expect(sql).toContain("enable row level security")
    expect(sql).toContain("auth.uid() = user_id")
    expect(sql).toContain("unique (task_id, local_date)")
    expect(sql).not.toContain("service_role")
  })
})
