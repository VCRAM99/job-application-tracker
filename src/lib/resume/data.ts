import "server-only"

import { requireUser } from "@/lib/auth/session"
import { listApplications } from "@/lib/records/data"
import { isUuid } from "@/lib/records/form-state"
import { PARSE_PROMPT_VERSION, RESUME_BUCKET } from "@/lib/resume/constants"
import { abandonedUploadPaths } from "@/lib/resume/files"
import { resumeContentSchema, type ResumeContent } from "@/lib/resume/content"
import type { ParseDropped } from "@/lib/resume/parse"
import type { ResumeEdit, TailorDropped } from "@/lib/resume/tailor"
import { createClient } from "@/lib/supabase/server"
import type { ReadabilityReport } from "@/lib/analyze/types"

export type ResumeSummary = {
  id: string
  label: string
  kind: "pdf" | "docx"
  sizeBytes: number
  parseStatus: "unparsed" | "parsed" | "failed"
  createdAt: string
}

export type ResumeDetail = ResumeSummary & {
  extractedText: string
  parsed: ResumeContent | null
  parseDropped: Partial<ParseDropped>
  parseError: string | null
  parseModel: string | null
  parseProvider: string | null
  parseMode: string | null
  /** Parsed with the current prompt version, so parsing again would not call the model. */
  parseCurrent: boolean
}

export type VersionSummary = {
  id: string
  resumeId: string | null
  label: string
  applicationId: string | null
  analysisId: string | null
  pending: number
  accepted: number
  createdAt: string
}

export type VersionDetail = VersionSummary & {
  base: ResumeContent
  final: ResumeContent
  edits: ResumeEdit[]
  dropped: TailorDropped
  readabilityBefore: ReadabilityReport | null
  readabilityAfter: ReadabilityReport | null
  provider: string
  model: string
  mode: string
  updatedAt: string
}

type Row = Record<string, unknown>

function summary(row: Row): ResumeSummary {
  return {
    id: String(row.id),
    label: String(row.label),
    kind: String(row.mime).includes("pdf") ? "pdf" : "docx",
    sizeBytes: Number(row.size_bytes),
    parseStatus: row.parse_status as ResumeSummary["parseStatus"],
    createdAt: String(row.created_at),
  }
}

function content(value: unknown): ResumeContent | null {
  const parsed = resumeContentSchema.safeParse(value)
  return parsed.success ? (parsed.data as ResumeContent) : null
}

function versionSummary(row: Row): VersionSummary {
  const edits = Array.isArray(row.edits) ? (row.edits as ResumeEdit[]) : []
  return {
    id: String(row.id),
    resumeId: row.resume_id ? String(row.resume_id) : null,
    label: String(row.label),
    applicationId: row.application_id ? String(row.application_id) : null,
    analysisId: row.analysis_id ? String(row.analysis_id) : null,
    pending: edits.filter((edit) => edit.status === "pending").length,
    accepted: edits.filter((edit) => edit.status === "accepted").length,
    createdAt: String(row.created_at),
  }
}

const SUMMARY_COLUMNS = "id, label, mime, size_bytes, parse_status, created_at"
const VERSION_COLUMNS = "id, resume_id, label, application_id, analysis_id, edits, created_at"

export async function listResumes(): Promise<ResumeSummary[] | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase.from("resumes").select(SUMMARY_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false })
  if (result.error) return null
  return (result.data ?? []).map((row) => summary(row as Row))
}

export async function getResume(id: string): Promise<{ resume: ResumeDetail; versions: VersionSummary[] } | null> {
  if (!isUuid(id)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const [found, versions] = await Promise.all([
    supabase.from("resumes").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("resume_versions").select(VERSION_COLUMNS).eq("user_id", user.id).eq("resume_id", id).order("created_at", { ascending: false }),
  ])
  if (found.error || !found.data) return null
  const row = found.data as Row
  return {
    resume: {
      ...summary(row),
      extractedText: String(row.extracted_text),
      parsed: content(row.parsed),
      parseDropped: (row.parse_dropped as Partial<ParseDropped>) ?? {},
      parseError: row.parse_error ? String(row.parse_error) : null,
      parseModel: row.parse_model ? String(row.parse_model) : null,
      parseProvider: row.parse_provider ? String(row.parse_provider) : null,
      parseMode: row.parse_execution_mode ? String(row.parse_execution_mode) : null,
      parseCurrent: row.parse_prompt_version === PARSE_PROMPT_VERSION,
    },
    versions: (versions.data ?? []).map((item) => versionSummary(item as Row)),
  }
}

export async function getVersion(id: string): Promise<VersionDetail | null> {
  if (!isUuid(id)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const found = await supabase.from("resume_versions").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (found.error || !found.data) return null
  const row = found.data as Row
  const base = content(row.base_content)
  const final = content(row.final_content)
  if (!base || !final) return null
  return {
    ...versionSummary(row),
    base,
    final,
    edits: Array.isArray(row.edits) ? (row.edits as ResumeEdit[]) : [],
    dropped: (row.dropped as TailorDropped) ?? {},
    readabilityBefore: (row.readability_before as ReadabilityReport | null) ?? null,
    readabilityAfter: (row.readability_after as ReadabilityReport | null) ?? null,
    provider: String(row.provider),
    model: String(row.model),
    mode: String(row.execution_mode),
    updatedAt: String(row.updated_at),
  }
}

/** Versions whose resume was deleted and that are linked to no application: listed on /resumes so they can be deleted. */
export async function listUnlinkedVersions(): Promise<VersionSummary[]> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("resume_versions")
    .select(VERSION_COLUMNS)
    .eq("user_id", user.id)
    .is("resume_id", null)
    .is("application_id", null)
    .order("created_at", { ascending: false })
  return (result.data ?? []).map((row) => versionSummary(row as Row))
}

/**
 * Deletes the signed-in user's own abandoned uploads (no resume row, older than a day) with the
 * user's session: the Storage policy only lets a user list and delete under their own prefix.
 * Best effort; a failure leaves the objects for the next visit. Returns how many were removed.
 */
export async function cleanupAbandonedUploads(now = new Date()): Promise<number> {
  const user = await requireUser()
  const supabase = await createClient()
  const storage = supabase.storage.from(RESUME_BUCKET)
  const [listed, rows] = await Promise.all([
    storage.list(user.id.toLowerCase(), { limit: 1000 }),
    supabase.from("resumes").select("storage_path").eq("user_id", user.id),
  ])
  if (listed.error || rows.error) return 0
  const registered = new Set((rows.data ?? []).map((row) => String(row.storage_path)))
  const paths = abandonedUploadPaths(user.id, listed.data ?? [], registered, now)
  if (paths.length === 0) return 0
  const removed = await storage.remove(paths)
  return removed.error ? 0 : paths.length
}

export async function listVersionsForApplication(applicationId: string): Promise<VersionSummary[]> {
  if (!isUuid(applicationId)) return []
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("resume_versions")
    .select(VERSION_COLUMNS)
    .eq("user_id", user.id)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
  return (result.data ?? []).map((row) => versionSummary(row as Row))
}

/** Completed analyses for the tailoring picker, newest first. */
export async function listCompletedAnalyses(): Promise<Array<{ id: string; label: string; applicationId: string | null }>> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("job_analyses")
    .select("id, jd_title, jd_company, application_id")
    .eq("user_id", user.id)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(50)
  return (result.data ?? []).map((row) => ({
    id: String(row.id),
    label: [row.jd_title || "Untitled job", row.jd_company].filter(Boolean).join(" · "),
    applicationId: row.application_id ? String(row.application_id) : null,
  }))
}

/** The user's applications for the link picker. Reuses listApplications, which loads company names separately. */
export async function listApplicationOptions(): Promise<Array<{ id: string; label: string }>> {
  const result = await listApplications()
  if (!result.ok) return []
  return result.data.slice(0, 200).map((application) => ({
    id: application.id,
    label: [application.jobTitle, application.companyName].filter(Boolean).join(" · "),
  }))
}

/** The saved execution mode, used as the default for the billing picker. */
export async function loadExecutionMode(): Promise<{ mode: "managed" | "byok"; configured: boolean }> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase.from("ai_user_settings").select("execution_mode, provider").eq("user_id", user.id).maybeSingle()
  const mode = result.data?.execution_mode === "managed" ? "managed" : "byok"
  return { mode, configured: Boolean(result.data?.provider) }
}

/** The newest completed analysis linked to an application, for the "Tailor resume" entry point. */
export async function latestAnalysisForApplication(applicationId: string): Promise<string | null> {
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
