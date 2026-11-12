import "server-only"

import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

/**
 * Every table that holds a user's own rows (each has user_id → auth.users, on delete cascade).
 * Read with the user's session, so RLS limits each query to their rows.
 */
export const EXPORT_TABLES = [
  "companies", "applications", "contacts", "tasks", "preparation_items", "user_preferences",
  "recurring_tasks", "recurring_task_completions", "health_goals", "food_entries", "water_entries",
  "sleep_entries", "step_entries", "weight_entries", "career_profiles", "career_sources",
  "ai_user_settings", "employment_entries", "education_entries", "skill_entries", "project_entries",
  "accomplishment_entries", "certification_entries", "ai_suggestions", "ai_usage_events",
  "ai_audit_events", "job_preferences", "saved_searches", "posting_states", "employer_preferences",
  "application_postings", "job_alert_subscriptions", "job_alert_deliveries", "job_analyses",
  "resumes", "resume_versions", "research_briefs", "interview_question_sets", "practice_answers",
  "story_bank_entries", "coach_drafts", "follow_up_suggestion_states",
] as const

/** Saved provider keys: which ones exist, never the key material (not readable by the user's role). */
const CREDENTIAL_COLUMNS = "id, provider, last_four, status, key_version, created_at, updated_at, revoked_at"
const MAX_ROWS_PER_TABLE = 10_000

export type AccountExport = {
  format: "job-tracker-export"
  version: 1
  exportedAt: string
  account: { id: string; email: string | null }
  tables: Record<string, unknown[]>
  providerKeys: unknown[]
  resumeFiles: string[]
  errors: string[]
}

export async function buildAccountExport(now = new Date()): Promise<AccountExport> {
  const user = await requireUser()
  const supabase = await createClient()
  const errors: string[] = []
  const tables: Record<string, unknown[]> = {}
  await Promise.all(
    EXPORT_TABLES.map(async (table) => {
      const result = await supabase.from(table).select("*").eq("user_id", user.id).limit(MAX_ROWS_PER_TABLE)
      if (result.error) {
        // A table that is not there yet (missing migration) is reported, not fatal.
        errors.push(`${table}: not exported (${result.error.code ?? "error"})`)
        tables[table] = []
      } else {
        tables[table] = result.data ?? []
        if ((result.data ?? []).length === MAX_ROWS_PER_TABLE) errors.push(`${table}: first ${MAX_ROWS_PER_TABLE} rows only`)
      }
    }),
  )
  const keys = await supabase.from("ai_credentials").select(CREDENTIAL_COLUMNS).eq("user_id", user.id)
  if (keys.error) errors.push(`ai_credentials: not exported (${keys.error.code ?? "error"})`)
  const files = await supabase.storage.from("resumes").list(user.id, { limit: 1000 })
  if (files.error) errors.push("resume files: not listed")
  return {
    format: "job-tracker-export",
    version: 1,
    exportedAt: now.toISOString(),
    account: { id: user.id, email: user.email ?? null },
    tables: Object.fromEntries(EXPORT_TABLES.map((table) => [table, tables[table] ?? []])),
    providerKeys: keys.data ?? [],
    resumeFiles: (files.data ?? []).map((file) => `${user.id}/${file.name}`),
    errors: errors.sort(),
  }
}
