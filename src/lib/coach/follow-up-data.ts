import "server-only"

import { requireUser } from "@/lib/auth/session"
import { userTimeZone } from "@/lib/coach/context"
import { followUpSuggestions, type FollowUpSuggestion, type SuggestionState } from "@/lib/coach/follow-ups"
import { createClient } from "@/lib/supabase/server"

/** The caller's current follow-up suggestions, optionally limited to one application or contact. */
export async function loadFollowUps(
  filter: { applicationId?: string; contactId?: string } = {},
  now = new Date(),
): Promise<{ ok: true; suggestions: FollowUpSuggestion[] } | { ok: false }> {
  const user = await requireUser()
  const supabase = await createClient()
  const [applications, companies, contacts, states, timeZone] = await Promise.all([
    supabase.from("applications").select("id, job_title, status, applied_at, status_changed_at, updated_at, company_id").eq("user_id", user.id),
    supabase.from("companies").select("id, name").eq("user_id", user.id),
    supabase.from("contacts").select("id, name, next_follow_up_date, application_id").eq("user_id", user.id),
    supabase.from("follow_up_suggestion_states").select("suggestion_key, dismissed_at, task_id").eq("user_id", user.id),
    userTimeZone(supabase, user.id),
  ])
  if (applications.error || contacts.error || states.error) return { ok: false }
  const taskIds = (states.data ?? []).map((row) => row.task_id).filter((id): id is string => Boolean(id))
  const tasks = taskIds.length ? await supabase.from("tasks").select("id").eq("user_id", user.id).in("id", taskIds) : { data: [] as Array<{ id: string }> }
  const existing = new Set((tasks.data ?? []).map((row) => String(row.id)))
  const stateMap = new Map<string, SuggestionState>(
    (states.data ?? []).map((row) => [String(row.suggestion_key), { dismissed: Boolean(row.dismissed_at), openTask: Boolean(row.task_id && existing.has(String(row.task_id))) }]),
  )
  const names = new Map((companies.data ?? []).map((row) => [String(row.id), String(row.name)]))
  const suggestions = followUpSuggestions({
    applications: (applications.data ?? []).map((row) => ({
      id: String(row.id),
      jobTitle: String(row.job_title),
      companyName: names.get(String(row.company_id)) ?? null,
      status: String(row.status),
      appliedAt: row.applied_at ?? null,
      statusChangedAt: row.status_changed_at ?? null,
      updatedAt: String(row.updated_at),
    })),
    contacts: (contacts.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      nextFollowUpDate: row.next_follow_up_date ?? null,
      applicationId: row.application_id ?? null,
    })),
    now,
    timeZone,
    states: stateMap,
  })
  return {
    ok: true,
    suggestions: suggestions.filter(
      (item) =>
        (!filter.applicationId || item.applicationId === filter.applicationId) && (!filter.contactId || item.contactId === filter.contactId),
    ),
  }
}
