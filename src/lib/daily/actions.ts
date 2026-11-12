"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/auth/session"
import { recurringTaskSchema, timezoneSchema } from "@/lib/daily/schemas"
import { assertDeleted, isMissingTable, recordErrorMessage } from "@/lib/records/logic"
import { isUuid } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

function refresh() {
  revalidatePath("/daily-tasks")
  revalidatePath("/settings")
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
