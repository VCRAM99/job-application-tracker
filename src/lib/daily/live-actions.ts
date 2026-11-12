"use server"

import { requireUser } from "@/lib/auth/session"
import { compareIso, isIsoDate } from "@/lib/daily/calendar"
import { foodFromRow, getDailyPreference, goalsFromRow, loadDailyWindow, weightFromRow } from "@/lib/daily/data"
import { HEALTH_METRICS, parseHiddenMetrics, type GoalMode, type HealthMetric, type ProteinDirection } from "@/lib/daily/goals"
import { canAddWater, waterTotal } from "@/lib/daily/health"
import type { AmountEntry, DailyGoals, DailyWindow, FoodEntry, WeightEntry } from "@/lib/daily/model"
import { isMissingTable } from "@/lib/records/logic"
import { isUuid } from "@/lib/records/form-state"
import { addCalendarDays } from "@/lib/records/logic"
import { createClient } from "@/lib/supabase/server"

/**
 * Daily Tasks mutations for the client page. Each validates its input, writes with the user's
 * session (RLS), and returns only what changed. None revalidates the route or redirects: the page
 * already shows the change optimistically and only needs the saved row (or an error to roll back).
 */

export type Result<T = null> = { ok: true; data: T } | { ok: false; message: string }

const fail = (message: string): Result<never> => ({ ok: false, message })
const ok = <T>(data: T): Result<T> => ({ ok: true, data })

function failureMessage(error: { code?: string; message?: string } | null, fallback: string): string {
  if (isMissingTable(error)) return "Daily tasks are not available yet. Apply the latest migration, then reload."
  return fallback
}

const MAX_RANGE_DAYS = 400

function wholeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null
}

function decimal(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value * 10) / 10 : null
}

/** Loads another range of days for the page's client window. */
export async function loadDailyRange(from: string, to: string): Promise<Result<DailyWindow>> {
  if (!isIsoDate(from) || !isIsoDate(to) || compareIso(from, to) > 0 || compareIso(addCalendarDays(from, MAX_RANGE_DAYS), to) < 0) {
    return fail("That date range is not available.")
  }
  const preference = await getDailyPreference()
  if (!preference.ok) return fail("Daily tasks could not be loaded.")
  const window = await loadDailyWindow(from, to, preference.data.healthTrackingEnabled)
  return window.ok ? ok(window.data) : fail("Those days could not be loaded.")
}

export async function setTaskCompletion(taskId: string, date: string, completed: boolean): Promise<Result> {
  if (!isUuid(taskId) || !isIsoDate(date) || typeof completed !== "boolean") return fail("That task could not be updated.")
  const user = await requireUser()
  const supabase = await createClient()
  if (completed) {
    const { error } = await supabase.from("recurring_task_completions").insert({ user_id: user.id, task_id: taskId, local_date: date })
    // Already completed (a double click, or another tab): the result the user wanted.
    if (error && error.code !== "23505") return fail(failureMessage(error, "The task could not be marked done."))
  } else {
    const { error } = await supabase.from("recurring_task_completions").delete().eq("user_id", user.id).eq("task_id", taskId).eq("local_date", date)
    if (error) return fail(failureMessage(error, "The task could not be marked not done."))
  }
  return ok(null)
}

export type FoodInput = { id?: string; date: string; description: string; calories: number; protein: number; entryTime: string }

export async function saveFoodEntry(input: FoodInput): Promise<Result<FoodEntry>> {
  const calories = wholeNumber(input?.calories, 0, 20000)
  const protein = decimal(input?.protein, 0, 1000)
  if (!isIsoDate(input?.date) || calories == null || protein == null) return fail("Enter calories (0–20,000) and protein (0–1,000 g).")
  const time = typeof input.entryTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.entryTime) ? input.entryTime : null
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 200) || null : null
  const user = await requireUser()
  const supabase = await createClient()
  const payload = { local_date: input.date, description, calories, protein, entry_time: time }
  const result = input.id
    ? isUuid(input.id)
      ? await supabase.from("food_entries").update(payload).eq("user_id", user.id).eq("id", input.id).select("*").single()
      : null
    : await supabase.from("food_entries").insert(payload).select("*").single()
  if (!result || result.error || !result.data) return fail(failureMessage(result?.error ?? null, "The food entry could not be saved."))
  return ok(foodFromRow(result.data))
}

const AMOUNT_TABLES = {
  water: { table: "water_entries", column: "amount_ml" },
  sleep: { table: "sleep_entries", column: "minutes" },
  steps: { table: "step_entries", column: "steps" },
} as const

export type AmountKind = keyof typeof AMOUNT_TABLES

/**
 * Water adds signed amounts (an undo is a negative entry), so the day's total may not go below
 * zero. Sleep and steps are positive entries that can be edited.
 */
export async function saveAmountEntry(kind: AmountKind, input: { id?: string; date: string; amount: number }): Promise<Result<AmountEntry>> {
  const spec = AMOUNT_TABLES[kind]
  if (!spec || !isIsoDate(input?.date)) return fail("That entry could not be saved.")
  const amount =
    kind === "water" ? wholeNumber(input.amount, -20000, 20000) : kind === "sleep" ? wholeNumber(input.amount, 1, 1440) : wholeNumber(input.amount, 1, 200000)
  if (amount == null || amount === 0) {
    return fail(kind === "sleep" ? "Enter between 1 minute and 24 hours." : kind === "steps" ? "Enter a whole number of steps." : "Enter a whole number of milliliters.")
  }
  const user = await requireUser()
  const supabase = await createClient()
  if (kind === "water") {
    if (input.id) return fail("Water is changed by adding or undoing an amount.")
    const day = await supabase.from("water_entries").select("amount_ml").eq("user_id", user.id).eq("local_date", input.date)
    if (day.error) return fail(failureMessage(day.error, "Water could not be saved."))
    if (!canAddWater(waterTotal((day.data ?? []).map((row) => Number(row.amount_ml))), amount)) return fail("That would make the day's water total negative.")
  }
  const payload = { local_date: input.date, [spec.column]: amount }
  const result = input.id
    ? isUuid(input.id)
      ? await supabase.from(spec.table).update(payload).eq("user_id", user.id).eq("id", input.id).select("*").single()
      : null
    : await supabase.from(spec.table).insert(payload).select("*").single()
  if (!result || result.error || !result.data) return fail(failureMessage(result?.error ?? null, "That entry could not be saved."))
  const row = result.data as Record<string, unknown>
  return ok({ id: String(row.id), date: String(row.local_date), amount: Number(row[spec.column]) })
}

export async function saveWeightEntry(input: { id?: string; date: string; kg: number }): Promise<Result<WeightEntry>> {
  const kg = typeof input?.kg === "number" && Number.isFinite(input.kg) && input.kg > 0 && input.kg < 500 ? Math.round(input.kg * 1000) / 1000 : null
  if (!isIsoDate(input?.date) || kg == null) return fail("Enter a weight above 0.")
  const user = await requireUser()
  const supabase = await createClient()
  const payload = { measured_on: input.date, weight_kg: kg }
  const result = input.id
    ? isUuid(input.id)
      ? await supabase.from("weight_entries").update(payload).eq("user_id", user.id).eq("id", input.id).select("*").single()
      : null
    : await supabase.from("weight_entries").insert(payload).select("*").single()
  if (!result || result.error || !result.data) return fail(failureMessage(result?.error ?? null, "The weight could not be saved."))
  return ok(weightFromRow(result.data))
}

const ENTRY_TABLES = { food: "food_entries", water: "water_entries", sleep: "sleep_entries", steps: "step_entries", weight: "weight_entries" } as const
export type EntryKind = keyof typeof ENTRY_TABLES

export async function deleteHealthEntry(kind: EntryKind, id: string): Promise<Result> {
  const table = ENTRY_TABLES[kind]
  if (!table || !isUuid(id)) return fail("That entry could not be deleted.")
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from(table).delete().eq("user_id", user.id).eq("id", id)
  if (error) return fail(failureMessage(error, "That entry could not be deleted."))
  return ok(null)
}

export type PreferencesInput = {
  calorieTarget: number | null
  proteinTarget: number | null
  waterGoalMl: number | null
  waterIncrementMl: number
  sleepTargetMinutes: number | null
  stepTarget: number | null
  weightUnit: "kg" | "lb"
  goalMode: GoalMode
  proteinDirection: ProteinDirection
  hiddenMetrics: HealthMetric[]
}

const optional = (value: unknown, max: number, whole = true) =>
  value == null ? { ok: true as const, value: null } : (whole ? wholeNumber(value, 0, max) : decimal(value, 0, max)) == null ? { ok: false as const } : { ok: true as const, value: whole ? (value as number) : Math.round((value as number) * 10) / 10 }

export async function saveDailyPreferences(input: PreferencesInput): Promise<Result<DailyGoals>> {
  const calorie = optional(input?.calorieTarget, 20000)
  const protein = optional(input?.proteinTarget, 1000, false)
  const water = optional(input?.waterGoalMl, 20000)
  const sleep = input?.sleepTargetMinutes == null ? { ok: true as const, value: null } : wholeNumber(input.sleepTargetMinutes, 1, 1440) == null ? { ok: false as const } : { ok: true as const, value: input.sleepTargetMinutes }
  const steps = optional(input?.stepTarget, 200000)
  const increment = wholeNumber(input?.waterIncrementMl, 1, 5000)
  if (!calorie.ok || !protein.ok || !water.ok || !sleep.ok || !steps.ok || increment == null) return fail("Check the targets: whole numbers, 0 or more.")
  if (input.goalMode !== "cut" && input.goalMode !== "bulk") return fail("Choose Cutting or Bulking.")
  if (input.proteinDirection !== "follow" && input.proteinDirection !== "reach") return fail("Choose how protein is read.")
  if (!Array.isArray(input.hiddenMetrics) || input.hiddenMetrics.some((metric) => !HEALTH_METRICS.includes(metric))) return fail("Unknown metric.")
  const user = await requireUser()
  const supabase = await createClient()
  const payload = {
    user_id: user.id,
    calorie_target: calorie.value,
    protein_target: protein.value,
    water_goal_ml: water.value,
    water_increment_ml: increment,
    sleep_target_minutes: sleep.value,
    step_target: steps.value,
    weight_unit: input.weightUnit === "lb" ? "lb" : "kg",
    goal_mode: input.goalMode,
    protein_direction: input.proteinDirection,
    hidden_metrics: parseHiddenMetrics(input.hiddenMetrics),
  }
  // One row per user (unique user_id): insert the first time, update after that.
  const result = await supabase.from("health_goals").upsert(payload, { onConflict: "user_id" }).select("*").single()
  if (result.error || !result.data) return fail(failureMessage(result.error, "Preferences could not be saved."))
  return ok(goalsFromRow(result.data))
}
