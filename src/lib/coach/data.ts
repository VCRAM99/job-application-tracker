import "server-only"

import type { GroundedRequirement } from "@/lib/analyze/types"
import { requireUser } from "@/lib/auth/session"
import type { Competency } from "@/lib/coach/constants"
import type { CountMap } from "@/lib/coach/input"
import type { PracticeFeedback } from "@/lib/coach/practice"
import type { InterviewQuestion } from "@/lib/coach/questions"
import type { StarOutline } from "@/lib/coach/stories"
import { isUuid } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

type Row = Record<string, unknown>

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asCounts(value: unknown): CountMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as CountMap) : {}
}

export type CoachAnalysis = {
  id: string
  title: string | null
  company: string | null
  applicationId: string | null
  jdText: string
  requirements: GroundedRequirement[]
}

/** A completed analysis the caller owns. Read directly so coach pages do not depend on the fit page flag. */
export async function loadCoachAnalysis(id: string): Promise<CoachAnalysis | null> {
  if (!isUuid(id)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("job_analyses")
    .select("id, jd_title, jd_company, application_id, jd_text, requirements, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (result.error || !result.data || result.data.status !== "complete") return null
  const row = result.data as Row
  return {
    id: String(row.id),
    title: typeof row.jd_title === "string" ? row.jd_title : null,
    company: typeof row.jd_company === "string" ? row.jd_company : null,
    applicationId: typeof row.application_id === "string" ? row.application_id : null,
    jdText: String(row.jd_text ?? ""),
    requirements: asArray<GroundedRequirement>(row.requirements),
  }
}

export async function latestCoachAnalysisId(applicationId: string): Promise<string | null> {
  if (!isUuid(applicationId)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("job_analyses")
    .select("id")
    .eq("user_id", user.id)
    .eq("application_id", applicationId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return result.data ? String(result.data.id) : null
}

export type QuestionSet = {
  id: string
  label: string
  applicationId: string | null
  analysisId: string | null
  questions: InterviewQuestion[]
  dropped: CountMap
  provider: string
  model: string
  mode: string
  createdAt: string
}

function mapSet(row: Row): QuestionSet {
  return {
    id: String(row.id),
    label: String(row.label),
    applicationId: row.application_id ? String(row.application_id) : null,
    analysisId: row.analysis_id ? String(row.analysis_id) : null,
    questions: asArray<InterviewQuestion>(row.questions),
    dropped: asCounts(row.dropped),
    provider: String(row.provider),
    model: String(row.model),
    mode: String(row.execution_mode),
    createdAt: String(row.created_at),
  }
}

export async function listQuestionSets(filter: { applicationId?: string } = {}): Promise<QuestionSet[]> {
  const user = await requireUser()
  const supabase = await createClient()
  let query = supabase.from("interview_question_sets").select("*").eq("user_id", user.id)
  if (filter.applicationId) query = query.eq("application_id", filter.applicationId)
  const result = await query.order("created_at", { ascending: false }).limit(20)
  if (result.error) return []
  return (result.data ?? []).map((row) => mapSet(row as Row))
}

export async function getQuestionSet(id: string): Promise<QuestionSet | null> {
  if (!isUuid(id)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase.from("interview_question_sets").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  return result.data ? mapSet(result.data as Row) : null
}

export type PracticeAttempt = { id: string; questionId: string; answer: string; feedback: PracticeFeedback; dropped: CountMap; model: string; createdAt: string }

export async function listPracticeAnswers(setId: string): Promise<PracticeAttempt[]> {
  if (!isUuid(setId)) return []
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("practice_answers")
    .select("id, question_id, answer, feedback, dropped, model, created_at")
    .eq("user_id", user.id)
    .eq("set_id", setId)
    .order("created_at", { ascending: false })
    .limit(100)
  return (result.data ?? []).map((row) => ({
    id: String(row.id),
    questionId: String(row.question_id),
    answer: String(row.answer),
    feedback: row.feedback as PracticeFeedback,
    dropped: asCounts(row.dropped),
    model: String(row.model),
    createdAt: String(row.created_at),
  }))
}

export type StoryEntry = { id: string; competency: Competency; factIds: string[]; outline: StarOutline; dropped: CountMap; model: string; updatedAt: string }

export async function listStories(): Promise<StoryEntry[] | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("story_bank_entries")
    .select("id, competency, fact_ids, outline, dropped, model, updated_at")
    .eq("user_id", user.id)
    .order("competency")
  if (result.error) return null
  return (result.data ?? []).map((row) => ({
    id: String(row.id),
    competency: row.competency as Competency,
    factIds: asArray<string>(row.fact_ids),
    outline: row.outline as StarOutline,
    dropped: asCounts(row.dropped),
    model: String(row.model),
    updatedAt: String(row.updated_at),
  }))
}

/** The question set that added this preparation item, for the link back from Preparation. */
export async function questionSetForPreparation(preparationId: string): Promise<{ setId: string; applicationId: string | null } | null> {
  if (!isUuid(preparationId)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("interview_question_sets")
    .select("id, application_id")
    .eq("user_id", user.id)
    .contains("questions", [{ preparationItemId: preparationId }])
    .limit(1)
    .maybeSingle()
  return result.data ? { setId: String(result.data.id), applicationId: result.data.application_id ? String(result.data.application_id) : null } : null
}

/** Whether the coach tables exist yet, so pages can show an unavailable state instead of failing. */
export async function coachTablesReady(): Promise<boolean> {
  const supabase = await createClient()
  const result = await supabase.from("coach_drafts").select("id").limit(1)
  return !result.error
}
