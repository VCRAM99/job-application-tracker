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
  createMutationQueue,
  displayToKg,
  displayedWater,
  kgToDisplay,
  normalizeSeries,
  pointsByDate,
  progressBand,
  progressBandFor,
  progressRatio,
  queueWater,
  reconcileWaterExtra,
  rollbackWater,
  sleepMinutes,
  waterTotal,
  type WaterLedger,
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

describe("progress thresholds", () => {
  it("uses muted bands only when a target exists", () => {
    expect(progressRatio(10, null)).toBeNull()
    expect(progressBand(null)).toBe("none")
    expect(progressBand(progressRatio(39, 100))).toBe("low")
    expect(progressBand(progressRatio(40, 100))).toBe("mid")
    expect(progressBand(progressRatio(99, 100))).toBe("mid")
    expect(progressBand(progressRatio(100, 100))).toBe("met")
    expect(progressBand(progressRatio(140, 100))).toBe("met")
    expect(progressRatio(-20, 100)).toBe(0)
  })

  it("keeps weight out of goal colors", () => {
    expect(progressBandFor("weight", 80, 70)).toBe("none")
    expect(progressBandFor("water", 3500, 3500)).toBe("met")
    expect(progressBandFor("steps", 1000, null)).toBe("none")
  })
})

describe("water optimistic ledger", () => {
  it("keeps every rapid increment until the server catches up", () => {
    let ledger: WaterLedger = { server: 0, extra: 0 }
    for (let click = 0; click < 4; click += 1) {
      const next = queueWater(ledger, 250)
      expect(next).not.toBeNull()
      ledger = next ?? ledger
    }
    expect(displayedWater(ledger)).toBe(1000)
    ledger = { server: 500, extra: reconcileWaterExtra(ledger.extra, 500) }
    expect(displayedWater(ledger)).toBe(1000)
    ledger = { server: 1000, extra: reconcileWaterExtra(ledger.extra, 500) }
    expect(ledger.extra).toBe(0)
    expect(displayedWater(ledger)).toBe(1000)
  })

  it("rolls back only the failed increment", () => {
    let ledger: WaterLedger = { server: 250, extra: 0 }
    ledger = queueWater(ledger, 250) ?? ledger
    ledger = queueWater(ledger, 250) ?? ledger
    ledger = rollbackWater(ledger, 250)
    expect(displayedWater(ledger)).toBe(500)
    expect(queueWater({ server: 0, extra: 0 }, -250)).toBeNull()
  })

  it("runs mutations one at a time", async () => {
    const enqueue = createMutationQueue()
    const order: number[] = []
    let releaseFirst: (() => void) | undefined
    const first = enqueue(async () => {
      order.push(1)
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
    })
    const second = enqueue(async () => {
      order.push(2)
    })
    await Promise.resolve()
    expect(order).toEqual([1])
    releaseFirst?.()
    await Promise.all([first, second])
    expect(order).toEqual([1, 2])
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
