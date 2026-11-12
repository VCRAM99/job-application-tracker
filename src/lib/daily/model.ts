import { compareIso, isScheduledOn, weekContaining, weeklyInsights, type RecurringTaskSchedule } from "@/lib/daily/calendar"
import type { GoalMode, HealthMetric, ProteinDirection } from "@/lib/daily/goals"
import type { WeightUnit } from "@/lib/daily/health"
import { addCalendarDays } from "@/lib/records/logic"

/**
 * The Daily Tasks page keeps a window of days in the browser, so changing day is a state change,
 * not a request. These are the plain shapes shared by the server loaders, the server actions,
 * and the client.
 */

export type DailyTask = RecurringTaskSchedule & { title: string; description: string | null }

export type FoodEntry = { id: string; date: string; description: string | null; calories: number; protein: number; entryTime: string | null }
/** Water (mL), sleep (minutes), and steps entries. */
export type AmountEntry = { id: string; date: string; amount: number }
export type WeightEntry = { id: string; date: string; kg: number }

export type DailyGoals = {
  calorieTarget: number | null
  proteinTarget: number | null
  waterGoalMl: number | null
  waterIncrementMl: number
  sleepTargetMinutes: number | null
  stepTarget: number | null
  weightUnit: WeightUnit
  goalMode: GoalMode
  proteinDirection: ProteinDirection
  hiddenMetrics: HealthMetric[]
}

/** Every record for the inclusive date range [from, to]. Completions are `taskId:date` keys. */
export type DailyWindow = {
  from: string
  to: string
  completions: string[]
  food: FoodEntry[]
  water: AmountEntry[]
  sleep: AmountEntry[]
  steps: AmountEntry[]
  weight: WeightEntry[]
}

export const completionKey = (taskId: string, date: string) => `${taskId}:${date}`

/** Days loaded around today on first render, and how far each extension reaches. */
export const WINDOW_BACK_DAYS = 90
export const WINDOW_AHEAD_DAYS = 14
export const EXTEND_DAYS = 45
/** Start loading the next range when the selected day is this close to the loaded edge. */
export const PREFETCH_MARGIN_DAYS = 7

export function initialRange(today: string): { from: string; to: string } {
  return { from: addCalendarDays(today, -WINDOW_BACK_DAYS), to: addCalendarDays(today, WINDOW_AHEAD_DAYS) }
}

export function inWindow(window: { from: string; to: string }, date: string): boolean {
  return compareIso(date, window.from) >= 0 && compareIso(date, window.to) <= 0
}

/** The range to load next so that `date` (and a margin around it) is covered, or null if it is. */
export function rangeToLoad(window: { from: string; to: string }, date: string): { from: string; to: string } | null {
  const low = addCalendarDays(date, -PREFETCH_MARGIN_DAYS)
  const high = addCalendarDays(date, PREFETCH_MARGIN_DAYS)
  // A jump far outside the window (from the calendar) loads a range around that date instead.
  if (compareIso(date, addCalendarDays(window.from, -EXTEND_DAYS)) < 0 || compareIso(date, addCalendarDays(window.to, EXTEND_DAYS)) > 0) {
    return { from: addCalendarDays(date, -EXTEND_DAYS), to: addCalendarDays(date, EXTEND_DAYS) }
  }
  if (compareIso(low, window.from) < 0) {
    const from = compareIso(addCalendarDays(window.from, -EXTEND_DAYS), low) < 0 ? addCalendarDays(window.from, -EXTEND_DAYS) : addCalendarDays(low, -EXTEND_DAYS)
    return { from, to: addCalendarDays(window.from, -1) }
  }
  if (compareIso(high, window.to) > 0) {
    const to = compareIso(addCalendarDays(window.to, EXTEND_DAYS), high) > 0 ? addCalendarDays(window.to, EXTEND_DAYS) : addCalendarDays(high, EXTEND_DAYS)
    return { from: addCalendarDays(window.to, 1), to }
  }
  return null
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Map(current.map((row) => [row.id, row]))
  for (const row of incoming) seen.set(row.id, row)
  return [...seen.values()]
}

/**
 * Adds a loaded range to the window. The window stays one contiguous range: a range that does
 * not touch it replaces it (that only happens on a jump far away in the calendar).
 */
export function mergeWindow(current: DailyWindow, incoming: DailyWindow): DailyWindow {
  const touches =
    compareIso(incoming.from, addCalendarDays(current.to, 1)) <= 0 && compareIso(incoming.to, addCalendarDays(current.from, -1)) >= 0
  if (!touches) return incoming
  return {
    from: compareIso(incoming.from, current.from) < 0 ? incoming.from : current.from,
    to: compareIso(incoming.to, current.to) > 0 ? incoming.to : current.to,
    completions: [...new Set([...current.completions, ...incoming.completions])],
    food: mergeById(current.food, incoming.food),
    water: mergeById(current.water, incoming.water),
    sleep: mergeById(current.sleep, incoming.sleep),
    steps: mergeById(current.steps, incoming.steps),
    weight: mergeById(current.weight, incoming.weight),
  }
}

export type ChecklistItem = { id: string; title: string; description: string | null; completed: boolean }

export function checklistFor(tasks: DailyTask[], completions: Set<string>, date: string, today: string): ChecklistItem[] {
  return tasks
    .filter((task) => isScheduledOn(task, date, today))
    .map((task) => ({ id: task.id, title: task.title, description: task.description, completed: completions.has(completionKey(task.id, date)) }))
}

export function insightsFor(tasks: DailyTask[], completions: string[], date: string) {
  const week = weekContaining(date)
  const rows = completions.map((key) => {
    const at = key.lastIndexOf(":")
    return { taskId: key.slice(0, at), localDate: key.slice(at + 1) }
  })
  const items = weeklyInsights(tasks, rows, week)
  return {
    week,
    items,
    completed: items.reduce((total, item) => total + item.completed, 0),
    scheduled: items.reduce((total, item) => total + item.scheduled, 0),
  }
}

export const onDate = <T extends { date: string }>(rows: T[], date: string) => rows.filter((row) => row.date === date)
