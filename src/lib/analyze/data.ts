import "server-only"

import { jobAnalysisEnabled } from "@/lib/ai/flags"
import { requireUser } from "@/lib/auth/session"
import { PROMPT_VERSION, SCHEMA_VERSION } from "@/lib/analyze/constants"
import { profileFingerprint } from "@/lib/analyze/facts"
import type {
  Blocker,
  BuiltAnalysis,
  GroundedRequirement,
  ReadabilityReport,
  RequirementMatch,
  ScoreBreakdown,
  VerifiedFact,
} from "@/lib/analyze/types"
import { jobsErrorKind } from "@/lib/jobs/query"
import { isMissingTable } from "@/lib/records/logic"
import { createClient } from "@/lib/supabase/server"

export type AnalysisStatus = "pending" | "complete" | "failed"

export type GapClaim = {
  requirementId: string
  factId: string
  factTable: string
}

export type AnalysisRecord = {
  id: string
  source: "posting" | "pasted" | "application"
  title: string | null
  company: string | null
  jdText: string
  status: AnalysisStatus
  errorCode: string | null
  score: number | null
  coverageConfidence: number | null
  breakdown: ScoreBreakdown
  requirements: GroundedRequirement[]
  matches: RequirementMatch[]
  blockers: Blocker[]
  droppedRequirementCount: number
  claims: GapClaim[]
  readability: ReadabilityReport | null
  provider: string | null
  model: string | null
  executionMode: "managed" | "byok" | null
  createdAt: string
  postingId: string | null
  applicationId: string | null
  resumeSourceId: string | null
}

export type AnalysisSummary = {
  id: string
  title: string | null
  company: string | null
  status: AnalysisStatus
  score: number | null
  createdAt: string
  source: string
}

type LoadError = "disabled" | "missing_table" | "unavailable"

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function mapAnalysis(row: Record<string, unknown>): AnalysisRecord {
  const breakdown = row.score_breakdown && typeof row.score_breakdown === "object"
    ? (row.score_breakdown as ScoreBreakdown)
    : {
        score: null,
        weightedSum: 0,
        weightedMax: 0,
        coverageConfidence: null,
        scorableCount: 0,
        unclearCount: 0,
      }
  return {
    id: String(row.id),
    source: row.source === "posting" || row.source === "application" ? row.source : "pasted",
    title: typeof row.jd_title === "string" ? row.jd_title : null,
    company: typeof row.jd_company === "string" ? row.jd_company : null,
    jdText: String(row.jd_text ?? ""),
    status: row.status === "pending" || row.status === "failed" ? row.status : "complete",
    errorCode: typeof row.error_code === "string" ? row.error_code : null,
    score: typeof row.score === "number" ? row.score : row.score == null ? null : Number(row.score),
    coverageConfidence:
      row.coverage_confidence == null || row.coverage_confidence === ""
        ? null
        : Number(row.coverage_confidence),
    breakdown,
    requirements: asArray<GroundedRequirement>(row.requirements),
    matches: asArray<RequirementMatch>(row.matches),
    blockers: asArray<Blocker>(row.blockers),
    droppedRequirementCount: Number(row.dropped_requirement_count ?? 0),
    claims: asArray<GapClaim>(row.gap_claims),
    readability: row.readability && typeof row.readability === "object" ? (row.readability as ReadabilityReport) : null,
    provider: typeof row.provider === "string" ? row.provider : null,
    model: typeof row.model === "string" ? row.model : null,
    executionMode: row.execution_mode === "managed" || row.execution_mode === "byok" ? row.execution_mode : null,
    createdAt: String(row.created_at ?? ""),
    postingId: typeof row.posting_id === "string" ? row.posting_id : null,
    applicationId: typeof row.application_id === "string" ? row.application_id : null,
    resumeSourceId: typeof row.resume_source_id === "string" ? row.resume_source_id : null,
  }
}

export async function listAnalyses(): Promise<{ ok: true; analyses: AnalysisSummary[] } | { ok: false; error: LoadError }> {
  if (!jobAnalysisEnabled()) return { ok: false, error: "disabled" }
  await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("job_analyses")
    .select("id, jd_title, jd_company, status, score, created_at, source")
    .order("created_at", { ascending: false })
    .limit(50)
  if (result.error) return { ok: false, error: isMissingTable(result.error) ? "missing_table" : "unavailable" }
  return {
    ok: true,
    analyses: (result.data ?? []).map((row) => ({
      id: String(row.id),
      title: row.jd_title,
      company: row.jd_company,
      status: row.status === "pending" || row.status === "failed" ? row.status : "complete",
      score: row.score == null ? null : Number(row.score),
      createdAt: String(row.created_at),
      source: String(row.source),
    })),
  }
}

export async function getAnalysis(
  id: string,
): Promise<{ ok: true; analysis: AnalysisRecord | null } | { ok: false; error: LoadError }> {
  if (!jobAnalysisEnabled()) return { ok: false, error: "disabled" }
  await requireUser()
  const supabase = await createClient()
  const result = await supabase.from("job_analyses").select("*").eq("id", id).maybeSingle()
  if (result.error) return { ok: false, error: isMissingTable(result.error) ? "missing_table" : "unavailable" }
  if (!result.data) return { ok: true, analysis: null }
  return { ok: true, analysis: mapAnalysis(result.data as Record<string, unknown>) }
}

export async function findCachedAnalysis(input: {
  jdHash: string
  profileFingerprint: string
}): Promise<string | null> {
  const supabase = await createClient()
  const result = await supabase
    .from("job_analyses")
    .select("id")
    .eq("jd_hash", input.jdHash)
    .eq("profile_fingerprint", input.profileFingerprint)
    .eq("prompt_version", PROMPT_VERSION)
    .eq("status", "complete")
    .maybeSingle()
  if (result.error || !result.data) return null
  return String(result.data.id)
}

const FACT_SOURCES: Array<{
  table: string
  type: VerifiedFact["type"]
  title: string
  detail: string
  start?: string
  end?: string
}> = [
  { table: "employment_entries", type: "employment", title: "title", detail: "organization", start: "start_date", end: "end_date" },
  { table: "education_entries", type: "education", title: "credential", detail: "institution" },
  { table: "skill_entries", type: "skill", title: "name", detail: "category" },
  { table: "project_entries", type: "project", title: "name", detail: "summary" },
  { table: "accomplishment_entries", type: "accomplishment", title: "title", detail: "summary" },
  { table: "certification_entries", type: "certification", title: "name", detail: "issuer" },
]

export async function loadVerifiedFacts(): Promise<{ ok: true; facts: VerifiedFact[] } | { ok: false; error: LoadError }> {
  const supabase = await createClient()
  const groups = await Promise.all(
    FACT_SOURCES.map(async (source) => {
      const columns = ["id", "updated_at", "evidence_excerpt", source.title, source.detail, source.start, source.end]
        .filter(Boolean)
        .join(", ")
      const result = await supabase
        .from(source.table)
        .select(columns)
        .eq("verification_state", "user_verified")
      return { source, result }
    }),
  )
  if (groups.some((group) => group.result.error && isMissingTable(group.result.error))) {
    return { ok: false, error: "missing_table" }
  }
  if (groups.some((group) => group.result.error)) return { ok: false, error: "unavailable" }
  const facts: VerifiedFact[] = []
  for (const group of groups) {
    for (const row of (group.result.data ?? []) as unknown as Array<Record<string, unknown>>) {
      facts.push({
        id: String(row.id),
        type: group.source.type,
        updatedAt: String(row.updated_at ?? ""),
        title: String(row[group.source.title] ?? ""),
        detail: String(row[group.source.detail] ?? ""),
        evidence: typeof row.evidence_excerpt === "string" ? row.evidence_excerpt : null,
        startDate: group.source.start && typeof row[group.source.start] === "string" ? String(row[group.source.start]) : null,
        endDate: group.source.end && typeof row[group.source.end] === "string" ? String(row[group.source.end]) : null,
      })
    }
  }
  return { ok: true, facts }
}

export function fingerprintOf(facts: VerifiedFact[]): string {
  return profileFingerprint(facts.map((fact) => ({ id: fact.id, updatedAt: fact.updatedAt })))
}

export async function loadFactLabels(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const supabase = await createClient()
  const labels: Record<string, string> = {}
  const pairs: Array<[string, string]> = [
    ["skill_entries", "name"],
    ["employment_entries", "title"],
    ["education_entries", "credential"],
    ["project_entries", "name"],
    ["accomplishment_entries", "title"],
    ["certification_entries", "name"],
  ]
  await Promise.all(
    pairs.map(async ([table, column]) => {
      const result = await supabase.from(table).select(`id, ${column}`).in("id", ids)
      for (const row of (result.data ?? []) as unknown as Array<Record<string, unknown>>) {
        labels[String(row.id)] = String(row[column] ?? "Verified fact")
      }
    }),
  )
  return labels
}

export async function loadAnalysisContext(): Promise<
  | {
      ok: true
      settings: { executionMode: "managed" | "byok"; provider: "openai" | "anthropic" | "google" } | null
      sources: Array<{ id: string; label: string }>
      hasByokKey: boolean
    }
  | { ok: false; error: LoadError }
> {
  if (!jobAnalysisEnabled()) return { ok: false, error: "disabled" }
  const supabase = await createClient()
  const [settings, sources, credentials] = await Promise.all([
    supabase.from("ai_user_settings").select("execution_mode, provider").maybeSingle(),
    supabase.from("career_sources").select("id, label").order("created_at", { ascending: false }),
    supabase.from("ai_credential_summaries").select("provider, status"),
  ])
  if ([settings.error, sources.error, credentials.error].some((error) => error && isMissingTable(error))) {
    return { ok: false, error: "missing_table" }
  }
  if (settings.error || sources.error) return { ok: false, error: "unavailable" }
  const provider = settings.data?.provider
  const mode = settings.data?.execution_mode
  const ready =
    (provider === "openai" || provider === "anthropic" || provider === "google") &&
    (mode === "managed" || mode === "byok")
      ? { executionMode: mode, provider }
      : null
  return {
    ok: true,
    settings: ready,
    sources: (sources.data ?? []).map((source) => ({ id: String(source.id), label: String(source.label) })),
    hasByokKey: (credentials.data ?? []).some(
      (row) => row.provider === provider && row.status === "unverified",
    ),
  }
}

export async function loadPostingText(id: string): Promise<
  { ok: true; title: string; company: string | null; description: string | null } | { ok: false; error: "missing" | "unavailable" }
> {
  const supabase = await createClient()
  const posting = await supabase
    .from("job_postings")
    .select("id, title, description_text, employer_id")
    .eq("id", id)
    .maybeSingle()
  if (posting.error) return { ok: false, error: jobsErrorKind(posting.error) === "missing_table" ? "unavailable" : "unavailable" }
  if (!posting.data) return { ok: false, error: "missing" }
  let company: string | null = null
  if (posting.data.employer_id) {
    const employer = await supabase
      .from("catalog_employers")
      .select("canonical_name")
      .eq("id", posting.data.employer_id)
      .maybeSingle()
    company = employer.data?.canonical_name ?? null
  }
  return {
    ok: true,
    title: String(posting.data.title),
    company,
    description: typeof posting.data.description_text === "string" ? posting.data.description_text : null,
  }
}

export async function loadApplicationPrefill(id: string): Promise<
  { ok: true; title: string; company: string | null; notes: string } | { ok: false }
> {
  const supabase = await createClient()
  const application = await supabase
    .from("applications")
    .select("job_title, notes, company_id")
    .eq("id", id)
    .maybeSingle()
  if (application.error || !application.data) return { ok: false }
  const company = await supabase.from("companies").select("name").eq("id", application.data.company_id).maybeSingle()
  return {
    ok: true,
    title: String(application.data.job_title),
    company: company.data?.name ?? null,
    notes: typeof application.data.notes === "string" ? application.data.notes : "",
  }
}

export type StoredAnalysisInput = {
  source: "posting" | "pasted" | "application"
  postingId: string | null
  applicationId: string | null
  resumeSourceId: string | null
  title: string | null
  company: string | null
  jdText: string
  jdHash: string
  profileFingerprint: string
  provider: string
  model: string
  executionMode: "managed" | "byok"
  analysis: BuiltAnalysis
  status?: "complete" | "failed"
  errorCode?: string | null
}

export async function insertAnalysis(input: StoredAnalysisInput): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const supabase = await createClient()
  const failed = input.status === "failed"
  const result = await supabase
    .from("job_analyses")
    .insert({
      posting_id: input.postingId,
      application_id: input.applicationId,
      resume_source_id: input.resumeSourceId,
      source: input.source,
      jd_title: input.title,
      jd_company: input.company,
      jd_text: input.jdText,
      jd_hash: input.jdHash,
      profile_fingerprint: input.profileFingerprint,
      prompt_version: PROMPT_VERSION,
      schema_version: SCHEMA_VERSION,
      provider: input.provider,
      model: input.model,
      execution_mode: input.executionMode,
      status: failed ? "failed" : "complete",
      error_code: failed ? input.errorCode ?? "transient" : null,
      score: failed ? null : input.analysis.score,
      coverage_confidence: failed ? null : input.analysis.scoreBreakdown.coverageConfidence,
      score_breakdown: input.analysis.scoreBreakdown,
      requirements: failed ? [] : input.analysis.requirements,
      matches: failed ? [] : input.analysis.matches,
      blockers: failed ? [] : input.analysis.blockers,
      dropped_requirement_count: failed ? 0 : input.analysis.droppedRequirementCount,
      gap_claims: [],
      readability: failed ? null : input.analysis.readability,
    })
    .select("id")
    .maybeSingle()
  if (result.error) {
    if (result.error.code === "23505") {
      const existing = await findCachedAnalysis({
        jdHash: input.jdHash,
        profileFingerprint: input.profileFingerprint,
      })
      if (existing) return { ok: true, id: existing }
    }
    return { ok: false, code: result.error.code ?? "unavailable" }
  }
  if (!result.data) return { ok: false, code: "unavailable" }
  return { ok: true, id: String(result.data.id) }
}
