import "server-only"

import { requireUser } from "@/lib/auth/session"
import type { DataResult } from "@/lib/records/data"
import { isMissingTable } from "@/lib/records/logic"
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

export async function getHealthBundle(from: string, to: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const [goals, food, water, sleep, steps, weight] = await Promise.all([
    supabase.from("health_goals").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("food_entries").select("*").eq("user_id", user.id).gte("local_date", from).lte("local_date", to),
    supabase.from("water_entries").select("*").eq("user_id", user.id).gte("local_date", from).lte("local_date", to),
    supabase.from("sleep_entries").select("*").eq("user_id", user.id).gte("local_date", from).lte("local_date", to),
    supabase.from("step_entries").select("*").eq("user_id", user.id).gte("local_date", from).lte("local_date", to),
    supabase.from("weight_entries").select("*").eq("user_id", user.id).gte("measured_on", from).lte("measured_on", to),
  ])
  const error = goals.error || food.error || water.error || sleep.error || steps.error || weight.error
  if (error) return failure(error)
  const goal = goals.data
  return {
    ok: true as const,
    data: {
      goals: goal
        ? {
            calorieTarget: goal.calorie_target,
            proteinTarget: goal.protein_target == null ? null : Number(goal.protein_target),
            waterGoalMl: goal.water_goal_ml,
            waterIncrementMl: goal.water_increment_ml,
            sleepTargetMinutes: goal.sleep_target_minutes,
            stepTarget: goal.step_target,
            weightUnit: goal.weight_unit as "kg" | "lb",
          }
        : emptyGoals,
      food: food.data ?? [],
      water: water.data ?? [],
      sleep: sleep.data ?? [],
      steps: steps.data ?? [],
      weight: weight.data ?? [],
    },
  }
}
