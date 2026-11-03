"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/session"
import { done, fail } from "@/lib/coach/action-utils"
import { userLocalDate } from "@/lib/coach/context"
import { loadFollowUps } from "@/lib/coach/follow-up-data"
import { SUGGESTION_KEY } from "@/lib/coach/follow-ups"
import type { RecordFormState } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"
import { coachAllowed } from "@/lib/beta"

const OFF = "Career coach is turned off."

function revalidateFollowUps(item: { applicationId: string | null; contactId: string | null }) {
  revalidatePath("/dashboard")
  revalidatePath("/tasks")
  if (item.applicationId) revalidatePath(`/applications/${item.applicationId}`)
  if (item.contactId) revalidatePath(`/networking/${item.contactId}`)
}

/**
 * Creates the task for a current suggestion. The title, due date, and link
 * come from the server's own rules, not the form, and the database function
 * returns the existing task on a repeat click.
 */
export async function createSuggestionTask(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const key = String(formData.get("key") ?? "")
  if (!SUGGESTION_KEY.test(key)) return fail("That suggestion is no longer current.")
  const loaded = await loadFollowUps()
  const supabase = await createClient()
  if (!loaded.ok) return fail("Follow-ups could not be loaded.")
  const item = loaded.suggestions.find((suggestion) => suggestion.key === key)
  if (!item) {
    // Already handled: report the existing task rather than creating another.
    const state = await supabase.from("follow_up_suggestion_states").select("task_id").eq("user_id", user.id).eq("suggestion_key", key).maybeSingle()
    return state.data?.task_id ? done("Task already created.") : fail("That suggestion is no longer current.")
  }
  const today = await userLocalDate(supabase, user.id)
  const created = await supabase.rpc("create_follow_up_task", {
    p_key: key,
    p_title: item.title.slice(0, 200),
    p_description: `${item.detail}${item.contactId ? ` Contact: /networking/${item.contactId}` : ""}`,
    p_due: item.dueDate < today ? today : item.dueDate,
    p_application_id: item.applicationId,
  })
  if (created.error) return fail("The task could not be created.")
  revalidateFollowUps(item)
  const data = created.data as { created?: boolean } | null
  return done(data?.created === false ? "Task already created." : "Task created.")
}

export async function dismissSuggestion(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const key = String(formData.get("key") ?? "")
  if (!SUGGESTION_KEY.test(key)) return fail("That suggestion is no longer current.")
  const supabase = await createClient()
  const saved = await supabase
    .from("follow_up_suggestion_states")
    .upsert({ user_id: user.id, suggestion_key: key, dismissed_at: new Date().toISOString() }, { onConflict: "user_id,suggestion_key" })
  if (saved.error) return fail("That suggestion could not be dismissed.")
  revalidatePath("/dashboard")
  return done("Dismissed.")
}
