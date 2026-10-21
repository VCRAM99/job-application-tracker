import "server-only"

import { aiFeaturesEnabled } from "@/lib/ai/flags"
import type { FactType } from "@/lib/ai/extraction"
import { isFactType } from "@/lib/ai/extraction"
import type { ProviderId, StoredExecutionMode } from "@/lib/ai/types"
import { isProvider, isStoredMode } from "@/lib/ai/types"
import { requireUser } from "@/lib/auth/session"
import { isMissingTable } from "@/lib/records/logic"
import { createClient } from "@/lib/supabase/server"

export type CareerFact = {
  id: string
  factType: FactType
  factTable: string
  verificationState: string
  title: string
  detail: string
  evidence: string | null
  sourceId: string | null
}

export type CareerSource = {
  id: string
  label: string
  body: string
  createdAt: string
}

export type CareerSuggestionView = {
  id: string
  sourceId: string
  factType: FactType
  status: string
  payload: Record<string, unknown>
  evidence: string | null
}

export type CredentialSummary = {
  id: string
  provider: ProviderId
  keyVersion: string
  lastFour: string
  status: "unverified" | "verified" | "invalid" | "revoked"
}

export type AiSettingsView = {
  executionMode: StoredExecutionMode
  provider: ProviderId | null
  model: string | null
}

export type UsageView = {
  requests: number
  tokens: number
  policyEnabled: boolean
  requestLimit: number
  tokenLimit: number
}

export type CareerWorkspace = {
  profile: {
    summary: string
    targetRoles: string[]
    countries: string[]
    workArrangements: string[]
    salaryFloor: number | null
    salaryCurrency: string
  }
  sources: CareerSource[]
  facts: CareerFact[]
  suggestions: CareerSuggestionView[]
  settings: AiSettingsView
  credentials: CredentialSummary[]
  usage: UsageView
}

export type CareerLoad =
  | { state: "disabled" }
  | { state: "missing_table" }
  | { state: "unavailable" }
  | { state: "ready"; workspace: CareerWorkspace }

type QueryError = { code?: string; message?: string } | null

function missing(error: QueryError): boolean {
  if (!error) return false
  return (
    isMissingTable(error) ||
    error.code === "PGRST202" ||
    /could not find the function/i.test(error.message ?? "")
  )
}

export async function loadCareer(): Promise<CareerLoad> {
  if (!aiFeaturesEnabled()) return { state: "disabled" }
  const user = await requireUser()
  const supabase = await createClient()
  const profile = await supabase
    .from("career_profiles")
    .select("id, summary, target_roles, countries, work_arrangements, salary_floor, salary_currency")
    .eq("user_id", user.id)
    .maybeSingle()
  if (profile.error) return missing(profile.error) ? { state: "missing_table" } : { state: "unavailable" }
  if (!profile.data) {
    const created = await supabase.from("career_profiles").insert({ user_id: user.id }).select("id").maybeSingle()
    if (created.error || !created.data) {
      const again = await supabase
        .from("career_profiles")
        .select("id, summary, target_roles, countries, work_arrangements, salary_floor, salary_currency")
        .eq("user_id", user.id)
        .maybeSingle()
      if (again.error || !again.data) {
        return missing(created.error) ? { state: "missing_table" } : { state: "unavailable" }
      }
      profile.data = again.data
    }
  }

  const [sources, suggestions, settings, credentials, policy, usage, ...factGroups] = await Promise.all([
    supabase
      .from("career_sources")
      .select("id, label, body, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_suggestions")
      .select("id, source_id, fact_type, status, payload, evidence_excerpt")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("ai_user_settings")
      .select("execution_mode, provider, model")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("ai_credential_summaries")
      .select("id, provider, key_version, last_four, status")
      .eq("user_id", user.id),
    supabase
      .from("ai_platform_policy")
      .select("managed_enabled, monthly_request_limit, monthly_token_limit")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("ai_usage_events")
      .select("status, billed_to, input_tokens, output_tokens, reserved_at")
      .eq("user_id", user.id),
    ...FACT_QUERIES.map((query) =>
      supabase.from(query.table).select(query.columns).eq("user_id", user.id),
    ),
  ])

  if (
    [sources.error, suggestions.error, settings.error, credentials.error, policy.error, usage.error].some(
      missing,
    ) ||
    factGroups.some((group) => missing(group.error))
  ) {
    return { state: "missing_table" }
  }
  if (
    sources.error ||
    suggestions.error ||
    settings.error ||
    credentials.error ||
    policy.error ||
    usage.error ||
    factGroups.some((group) => group.error)
  ) {
    return { state: "unavailable" }
  }

  const month = new Date().toISOString().slice(0, 7)
  const usageRows = (usage.data ?? []) as UsageRow[]
  const monthRows = usageRows.filter(
    (row) => row.status === "succeeded" && String(row.reserved_at).slice(0, 7) === month,
  )

  return {
    state: "ready",
    workspace: {
      profile: mapProfile(profile.data as ProfileRow | null),
      sources: ((sources.data ?? []) as SourceRow[]).map((row) => ({
        id: row.id,
        label: row.label,
        body: row.body,
        createdAt: row.created_at,
      })),
      facts: factGroups.flatMap((group, index) =>
        ((group.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) =>
          mapFact(FACT_QUERIES[index]?.factType ?? "skill", row),
        ),
      ),
      suggestions: ((suggestions.data ?? []) as SuggestionRow[])
        .filter((row) => isFactType(row.fact_type))
        .map((row) => ({
          id: row.id,
          sourceId: row.source_id,
          factType: row.fact_type as FactType,
          status: row.status,
          payload: row.payload ?? {},
          evidence: row.evidence_excerpt,
        })),
      settings: mapSettings(settings.data as SettingsRow | null),
      credentials: ((credentials.data ?? []) as CredentialRow[])
        .filter((row) => isProvider(row.provider))
        .map((row) => ({
          id: row.id,
          provider: row.provider as ProviderId,
          keyVersion: row.key_version,
          lastFour: row.last_four,
          status: row.status,
        })),
      usage: {
        requests: monthRows.length,
        tokens: monthRows.reduce(
          (sum, row) => sum + (row.input_tokens ?? 0) + (row.output_tokens ?? 0),
          0,
        ),
        policyEnabled: Boolean((policy.data as PolicyRow | null)?.managed_enabled),
        requestLimit: (policy.data as PolicyRow | null)?.monthly_request_limit ?? 0,
        tokenLimit: (policy.data as PolicyRow | null)?.monthly_token_limit ?? 0,
      },
    },
  }
}

const FACT_QUERIES: Array<{ table: string; factType: FactType; columns: string }> = [
  {
    table: "employment_entries",
    factType: "employment",
    columns: "id, verification_state, source_id, evidence_excerpt, organization, title, location, start_date, end_date, is_current",
  },
  {
    table: "education_entries",
    factType: "education",
    columns: "id, verification_state, source_id, evidence_excerpt, institution, credential, field_of_study, start_date, end_date",
  },
  {
    table: "skill_entries",
    factType: "skill",
    columns: "id, verification_state, source_id, evidence_excerpt, name, category",
  },
  {
    table: "project_entries",
    factType: "project",
    columns: "id, verification_state, source_id, evidence_excerpt, name, role_title, summary",
  },
  {
    table: "accomplishment_entries",
    factType: "accomplishment",
    columns: "id, verification_state, source_id, evidence_excerpt, title, summary",
  },
  {
    table: "certification_entries",
    factType: "certification",
    columns: "id, verification_state, source_id, evidence_excerpt, name, issuer, issued_on",
  },
]

type ProfileRow = {
  summary: string | null
  target_roles: string[] | null
  countries: string[] | null
  work_arrangements: string[] | null
  salary_floor: number | string | null
  salary_currency: string
}

type SourceRow = { id: string; label: string; body: string; created_at: string }
type SuggestionRow = {
  id: string
  source_id: string
  fact_type: string
  status: string
  payload: Record<string, unknown> | null
  evidence_excerpt: string | null
}
type SettingsRow = { execution_mode: string; provider: string | null; model: string | null }
type CredentialRow = {
  id: string
  provider: string
  key_version: string
  last_four: string
  status: CredentialSummary["status"]
}
type PolicyRow = {
  managed_enabled: boolean
  monthly_request_limit: number
  monthly_token_limit: number
}
type UsageRow = {
  status: string
  billed_to: string
  input_tokens: number | null
  output_tokens: number | null
  reserved_at: string
}

function mapProfile(row: ProfileRow | null): CareerWorkspace["profile"] {
  const floor = row?.salary_floor == null ? null : Number(row.salary_floor)
  return {
    summary: row?.summary ?? "",
    targetRoles: row?.target_roles ?? [],
    countries: row?.countries ?? [],
    workArrangements: row?.work_arrangements ?? [],
    salaryFloor: Number.isFinite(floor) ? floor : null,
    salaryCurrency: row?.salary_currency ?? "USD",
  }
}

function mapSettings(row: SettingsRow | null): AiSettingsView {
  return {
    executionMode: row && isStoredMode(row.execution_mode) ? row.execution_mode : "byok",
    provider: row?.provider && isProvider(row.provider) ? row.provider : null,
    model: row?.model ?? null,
  }
}

function tableForFact(factType: FactType): string {
  if (factType === "employment") return "employment_entries"
  if (factType === "education") return "education_entries"
  if (factType === "skill") return "skill_entries"
  if (factType === "project") return "project_entries"
  if (factType === "accomplishment") return "accomplishment_entries"
  return "certification_entries"
}

function mapFact(factType: FactType, row: Record<string, unknown>): CareerFact {
  const evidence = typeof row.evidence_excerpt === "string" ? row.evidence_excerpt : null
  const sourceId = typeof row.source_id === "string" ? row.source_id : null
  const base = {
    id: String(row.id),
    factType,
    factTable: tableForFact(factType),
    verificationState: String(row.verification_state),
    evidence,
    sourceId,
  }
  if (factType === "employment") {
    return { ...base, title: String(row.title), detail: String(row.organization) }
  }
  if (factType === "education") {
    return { ...base, title: String(row.credential), detail: String(row.institution) }
  }
  if (factType === "skill") {
    return { ...base, title: String(row.name), detail: String(row.category ?? "") }
  }
  if (factType === "project") {
    return { ...base, title: String(row.name), detail: String(row.summary ?? "") }
  }
  if (factType === "accomplishment") {
    return { ...base, title: String(row.title), detail: String(row.summary ?? "") }
  }
  return { ...base, title: String(row.name), detail: String(row.issuer ?? "") }
}
