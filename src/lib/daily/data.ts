import "server-only"

import { requireUser } from "@/lib/auth/session"
import type { DataResult } from "@/lib/records/data"
import { isMissingTable } from "@/lib/records/logic"
import { parseGoalMode, parseHiddenMetrics, parseProteinDirection } from "@/lib/daily/goals"
import { completionKey, type DailyGoals, type DailyWindow, type FoodEntry, type WeightEntry } from "@/lib/daily/model"
import { createClient } from "@/lib/supabase/server"

function failure(error: { code?: string; message?: string } | null): DataResult<never> {
  return { ok: false, error: isMissingTable(error) ? "missing_table" : "unavailable" }
}

export type DailyPreference = {
  timezone: string | null
  healthTrackingEnabled: boolean
}

export type RecurringTaskRow = {
  id: string
  title: string
  description: string | null
  weekdays: number[]
  startDate: string | null
  endDate: string | null
  status: "active" | "paused"
}

export type HealthGoals = {
  calorieTarget: number | null
  proteinTarget: number | null
  waterGoalMl: number | null
  waterIncrementMl: number
  sleepTargetMinutes: number | null
  stepTarget: number | null
  weightUnit: "kg" | "lb"
}

const emptyGoals: HealthGoals = {
  calorieTarget: null,
  proteinTarget: null,
  waterGoalMl: null,
  waterIncrementMl: 250,
  sleepTargetMinutes: null,
  stepTarget: null,
  weightUnit: "kg",
}

export async function getDailyPreference(): Promise<DataResult<DailyPreference>> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("user_preferences")
    .select("timezone, health_tracking_enabled")
    .eq("user_id", user.id)
    .maybeSingle()
  if (error) return failure(error)
  return {
    ok: true,
    data: {
      timezone: data?.timezone ?? null,
      healthTrackingEnabled: data?.health_tracking_enabled ?? false,
    },
  }
}

export async function listRecurringTasks(): Promise<DataResult<RecurringTaskRow[]>> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recurring_tasks")
    .select("id, title, description, weekdays, start_date, end_date, status")
    .eq("user_id", user.id)
    .order("title")
  if (error) return failure(error)
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      weekdays: row.weekdays,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    })),
  }
}

export async function listCompletions(from: string, to: string): Promise<DataResult<Array<{ taskId: string; localDate: string }>>> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recurring_task_completions")
    .select("task_id, local_date")
    .eq("user_id", user.id)
    .gte("local_date", from)
    .lte("local_date", to)
  if (error) return failure(error)
  return {
    ok: true,
    data: (data ?? []).map((row) => ({ taskId: row.task_id, localDate: row.local_date })),
  }
}

type GoalRow = {
  calorie_target: number | null
  protein_target: number | string | null
  water_goal_ml: number | null
  water_increment_ml: number | null
  sleep_target_minutes: number | null
  step_target: number | null
  weight_unit: string | null
  goal_mode?: string | null
  protein_direction?: string | null
  hidden_metrics?: string[] | null
}

/** Saved targets with defaults for anything unset, including users who never saved targets. */
export function goalsFromRow(row: GoalRow | null): DailyGoals {
  return {
    calorieTarget: row?.calorie_target ?? null,
    proteinTarget: row?.protein_target == null ? null : Number(row.protein_target),
    waterGoalMl: row?.water_goal_ml ?? null,
    waterIncrementMl: row?.water_increment_ml ?? emptyGoals.waterIncrementMl,
    sleepTargetMinutes: row?.sleep_target_minutes ?? null,
    stepTarget: row?.step_target ?? null,
    weightUnit: row?.weight_unit === "lb" ? "lb" : "kg",
    goalMode: parseGoalMode(row?.goal_mode),
    proteinDirection: parseProteinDirection(row?.protein_direction),
    hiddenMetrics: parseHiddenMetrics(row?.hidden_metrics),
  }
}

export async function loadDailyGoals(): Promise<DataResult<DailyGoals>> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("health_goals").select("*").eq("user_id", user.id).maybeSingle()
  if (error) return failure(error)
  return { ok: true, data: goalsFromRow(data) }
}

/**
 * Every completion and health entry for [from, to], in one parallel batch. Health rows are read
 * only when health tracking is on. Each query still filters by user_id, on top of RLS.
 */
export async function loadDailyWindow(from: string, to: string, health: boolean): Promise<DataResult<DailyWindow>> {
  const user = await requireUser()
  const supabase = await createClient()
  const ranged = (table: string, column = "local_date") =>
    health
      ? supabase.from(table).select("*").eq("user_id", user.id).gte(column, from).lte(column, to)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null })
  const [completions, food, water, sleep, steps, weight] = await Promise.all([
    supabase.from("recurring_task_completions").select("task_id, local_date").eq("user_id", user.id).gte("local_date", from).lte("local_date", to),
    ranged("food_entries"),
    ranged("water_entries"),
    ranged("sleep_entries"),
    ranged("step_entries"),
    ranged("weight_entries", "measured_on"),
  ])
  const error = completions.error || food.error || water.error || sleep.error || steps.error || weight.error
  if (error) return failure(error)
  type Row = Record<string, unknown>
  return {
    ok: true,
    data: {
      from,
      to,
      completions: (completions.data ?? []).map((row) => completionKey(String(row.task_id), String(row.local_date))),
      food: ((food.data ?? []) as Row[]).map(foodFromRow),
      water: ((water.data ?? []) as Row[]).map((row) => ({ id: String(row.id), date: String(row.local_date), amount: Number(row.amount_ml) })),
      sleep: ((sleep.data ?? []) as Row[]).map((row) => ({ id: String(row.id), date: String(row.local_date), amount: Number(row.minutes) })),
      steps: ((steps.data ?? []) as Row[]).map((row) => ({ id: String(row.id), date: String(row.local_date), amount: Number(row.steps) })),
      weight: ((weight.data ?? []) as Row[]).map(weightFromRow),
    },
  }
}

export function foodFromRow(row: Record<string, unknown>): FoodEntry {
  return {
    id: String(row.id),
    date: String(row.local_date),
    description: row.description == null ? null : String(row.description),
    calories: Number(row.calories),
    protein: Number(row.protein),
    entryTime: row.entry_time == null ? null : String(row.entry_time).slice(0, 5),
  }
}

export function weightFromRow(row: Record<string, unknown>): WeightEntry {
  return { id: String(row.id), date: String(row.measured_on), kg: Number(row.weight_kg) }
}
