"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/auth/session"
import { isIsoDate } from "@/lib/daily/calendar"
import { canAddWater, displayToKg, sleepMinutes, waterTotal } from "@/lib/daily/health"
import { optionalNonnegative, recurringTaskSchema, timezoneSchema } from "@/lib/daily/schemas"
import { assertDeleted, isMissingTable, recordErrorMessage } from "@/lib/records/logic"
import { isUuid } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

function refresh() {
  revalidatePath("/daily-tasks")
  revalidatePath("/settings")
}

function numberOrRedirect(value: number | null | string): number | null {
  if (typeof value === "string") redirect("/daily-tasks?error=invalid")
  return value
}

function message(error: { code?: string; message?: string } | null): string {
  if (isMissingTable(error)) return "Daily tasks are not available yet. Apply the latest migration, then reload."
  return recordErrorMessage(error)
}

export async function saveTimezone(timezone: string) {
  const parsed = timezoneSchema.safeParse(timezone)
  if (!parsed.success) return
  const user = await requireUser()
  const supabase = await createClient()
  const existing = await supabase.from("user_preferences").select("timezone").eq("user_id", user.id).maybeSingle()
  if (existing.error || existing.data?.timezone) return
  if (existing.data) {
    await supabase.from("user_preferences").update({ timezone: parsed.data }).eq("user_id", user.id)
  } else {
    await supabase.from("user_preferences").insert({ user_id: user.id, timezone: parsed.data })
  }
  refresh()
}

export async function setHealthTracking(formData: FormData) {
  const user = await requireUser()
  const enabled = formData.get("enabled") === "true"
  const supabase = await createClient()
  const existing = await supabase.from("user_preferences").select("id").eq("user_id", user.id).maybeSingle()
  if (existing.error) return
  if (existing.data) {
    await supabase.from("user_preferences").update({ health_tracking_enabled: enabled }).eq("user_id", user.id)
  } else {
    await supabase.from("user_preferences").insert({ user_id: user.id, health_tracking_enabled: enabled })
  }
  refresh()
}

export async function saveRecurringTask(formData: FormData) {
  await requireUser()
  const weekdays = formData.getAll("weekdays").map((value) => Number(value))
  const parsed = recurringTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    weekdays,
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    status: formData.get("status") === "paused" ? "paused" : "active",
  })
  if (!parsed.success) redirect("/daily-tasks?error=invalid")
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const payload = {
    title: parsed.data.title,
    description: parsed.data.description,
    weekdays: parsed.data.weekdays,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    status: parsed.data.status,
  }
  const user = await requireUser()
  const result = isUuid(id)
    ? await supabase.from("recurring_tasks").update(payload).eq("user_id", user.id).eq("id", id)
    : await supabase.from("recurring_tasks").insert(payload)
  if (result.error) redirect(`/daily-tasks?error=${encodeURIComponent(message(result.error))}`)
  refresh()
  redirect("/daily-tasks")
}

export async function setRecurringStatus(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get("id") ?? "")
  const status = formData.get("status") === "paused" ? "paused" : "active"
  if (!isUuid(id)) redirect("/daily-tasks")
  const supabase = await createClient()
  await supabase.from("recurring_tasks").update({ status }).eq("user_id", user.id).eq("id", id)
  refresh()
}

export async function deleteRecurringTask(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get("id") ?? "")
  if (!isUuid(id)) redirect("/daily-tasks")
  const supabase = await createClient()
  const { error } = await supabase.from("recurring_tasks").delete().eq("user_id", user.id).eq("id", id)
  assertDeleted(error)
  refresh()
  redirect("/daily-tasks")
}

export async function toggleCompletion(formData: FormData) {
  const user = await requireUser()
  const taskId = String(formData.get("taskId") ?? "")
  const date = String(formData.get("date") ?? "")
  const completed = formData.get("completed") === "true"
  if (!isUuid(taskId) || !isIsoDate(date)) return
  const supabase = await createClient()
  if (completed) {
    await supabase.from("recurring_task_completions").insert({
      user_id: user.id,
      task_id: taskId,
      local_date: date,
    })
  } else {
    await supabase
      .from("recurring_task_completions")
      .delete()
      .eq("user_id", user.id)
      .eq("task_id", taskId)
      .eq("local_date", date)
  }
  refresh()
}

export async function saveHealthGoals(formData: FormData) {
  const user = await requireUser()
  const unit = formData.get("weightUnit") === "lb" ? "lb" : "kg"
  const calorie = numberOrRedirect(optionalNonnegative(String(formData.get("calorieTarget") ?? ""), "calorie target", 20000))
  const protein = numberOrRedirect(optionalNonnegative(String(formData.get("proteinTarget") ?? ""), "protein target", 1000))
  const waterGoal = numberOrRedirect(optionalNonnegative(String(formData.get("waterGoalMl") ?? ""), "water goal", 20000))
  const increment = numberOrRedirect(optionalNonnegative(String(formData.get("waterIncrementMl") ?? "250"), "water increment", 5000))
  const sleep = numberOrRedirect(optionalNonnegative(String(formData.get("sleepTargetMinutes") ?? ""), "sleep target", 1440))
  const steps = numberOrRedirect(optionalNonnegative(String(formData.get("stepTarget") ?? ""), "step target", 200000))
  const supabase = await createClient()
  const payload = {
    user_id: user.id,
    calorie_target: calorie,
    protein_target: protein,
    water_goal_ml: waterGoal,
    water_increment_ml: increment != null && increment > 0 ? Math.round(increment) : 250,
    sleep_target_minutes: sleep,
    step_target: steps,
    weight_unit: unit,
  }
  const existing = await supabase.from("health_goals").select("id").eq("user_id", user.id).maybeSingle()
  if (existing.data) {
    await supabase.from("health_goals").update(payload).eq("user_id", user.id)
  } else {
    await supabase.from("health_goals").insert(payload)
  }
  refresh()
}

export async function saveFood(formData: FormData) {
  const user = await requireUser()
  const date = String(formData.get("date") ?? "")
  const calories = optionalNonnegative(String(formData.get("calories") ?? ""), "calories", 20000)
  const protein = optionalNonnegative(String(formData.get("protein") ?? ""), "protein", 1000)
  if (!isIsoDate(date) || typeof calories !== "number" || typeof protein !== "number") redirect("/daily-tasks")
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const payload = {
    local_date: date,
    description: String(formData.get("description") ?? "").trim().slice(0, 200) || null,
    calories: Math.round(calories),
    protein,
    entry_time: String(formData.get("entryTime") ?? "") || null,
  }
  const result = isUuid(id)
    ? await supabase.from("food_entries").update(payload).eq("user_id", user.id).eq("id", id)
    : await supabase.from("food_entries").insert(payload)
  if (result.error) redirect("/daily-tasks?error=invalid")
  refresh()
  redirect(`/daily-tasks?date=${date}`)
}

export async function deleteFood(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get("id") ?? "")
  if (!isUuid(id)) return
  const supabase = await createClient()
  const { error } = await supabase.from("food_entries").delete().eq("user_id", user.id).eq("id", id)
  assertDeleted(error)
  refresh()
}

async function dayWater(userId: string, date: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("water_entries")
    .select("amount_ml")
    .eq("user_id", userId)
    .eq("local_date", date)
  return waterTotal((data ?? []).map((row) => row.amount_ml as number))
}

export async function addWater(formData: FormData) {
  const user = await requireUser()
  const date = String(formData.get("date") ?? "")
  const amount = Number(formData.get("amount") ?? 0)
  if (!isIsoDate(date) || !Number.isInteger(amount) || amount === 0) return
  const current = await dayWater(user.id, date)
  if (!canAddWater(current, amount)) return
  const supabase = await createClient()
  await supabase.from("water_entries").insert({ user_id: user.id, local_date: date, amount_ml: amount })
  refresh()
}

export async function saveSleep(formData: FormData) {
  const user = await requireUser()
  const date = String(formData.get("date") ?? "")
  const minutes = sleepMinutes(Number(formData.get("hours")), Number(formData.get("minutes")))
  if (!isIsoDate(date) || minutes == null) redirect("/daily-tasks?error=invalid")
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const result = isUuid(id)
    ? await supabase.from("sleep_entries").update({ minutes, local_date: date }).eq("user_id", user.id).eq("id", id)
    : await supabase.from("sleep_entries").insert({ local_date: date, minutes })
  if (result.error) redirect("/daily-tasks?error=invalid")
  refresh()
  redirect(`/daily-tasks?date=${date}`)
}

export async function saveSteps(formData: FormData) {
  const user = await requireUser()
  const date = String(formData.get("date") ?? "")
  const steps = Number(formData.get("steps"))
  if (!isIsoDate(date) || !Number.isInteger(steps) || steps < 1) redirect("/daily-tasks?error=invalid")
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const result = isUuid(id)
    ? await supabase.from("step_entries").update({ steps, local_date: date }).eq("user_id", user.id).eq("id", id)
    : await supabase.from("step_entries").insert({ local_date: date, steps })
  if (result.error) redirect("/daily-tasks?error=invalid")
  refresh()
  redirect(`/daily-tasks?date=${date}`)
}

export async function saveWeight(formData: FormData) {
  const user = await requireUser()
  const date = String(formData.get("date") ?? "")
  const amount = Number(formData.get("weight"))
  const unit = formData.get("unit") === "lb" ? "lb" : "kg"
  if (!isIsoDate(date) || !Number.isFinite(amount) || amount <= 0) redirect("/daily-tasks?error=invalid")
  const supabase = await createClient()
  const id = String(formData.get("id") ?? "")
  const payload = { measured_on: date, weight_kg: displayToKg(amount, unit) }
  const result = isUuid(id)
    ? await supabase.from("weight_entries").update(payload).eq("user_id", user.id).eq("id", id)
    : await supabase.from("weight_entries").insert(payload)
  if (result.error) redirect("/daily-tasks?error=invalid")
  refresh()
  redirect(`/daily-tasks?date=${date}`)
}

export async function deleteOwned(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get("id") ?? "")
  const table = String(formData.get("table") ?? "")
  const allowed = new Set(["food_entries", "water_entries", "sleep_entries", "step_entries", "weight_entries"])
  if (!isUuid(id) || !allowed.has(table)) return
  const supabase = await createClient()
  const { error } = await supabase.from(table).delete().eq("user_id", user.id).eq("id", id)
  assertDeleted(error)
  refresh()
}
