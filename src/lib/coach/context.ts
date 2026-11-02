import "server-only"

import type { VerifiedFact } from "@/lib/analyze/types"
import type { DraftFormat } from "@/lib/ai/verify"
import type { DraftKind } from "@/lib/coach/constants"
import type { DraftContext } from "@/lib/coach/drafts"
import type { ResearchClaim } from "@/lib/coach/research"
import { isValidTimeZone, localDateInTimeZone } from "@/lib/daily/calendar"
import { isUuid } from "@/lib/records/form-state"
import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>
type Row = Record<string, unknown>

export type DraftLinks = { contactId: string | null; applicationId: string | null; analysisId: string | null; briefId: string | null }

/**
 * Loads the caller's own contact, application, latest analysis, and brief
 * for a draft. Every read filters on the caller; a missing link is null.
 */
export async function loadDraftContext(
  supabase: Supabase,
  userId: string,
  input: { kind: DraftKind; format: DraftFormat; contactId: string; applicationId: string; briefId: string; question: string | null; angle: string | null; maxChars?: number; facts: VerifiedFact[] },
): Promise<{ ok: true; context: DraftContext; links: DraftLinks } | { ok: false; message: string }> {
  let contact: DraftContext["contact"] = null
  let contactId: string | null = null
  let applicationId = isUuid(input.applicationId) ? input.applicationId : null
  if (input.contactId) {
    if (!isUuid(input.contactId)) return { ok: false, message: "That contact could not be found." }
    const found = await supabase
      .from("contacts")
      .select("id, name, role_title, organization, relationship_type, notes, application_id")
      .eq("id", input.contactId)
      .eq("user_id", userId)
      .maybeSingle()
    if (!found.data) return { ok: false, message: "That contact could not be found." }
    contactId = String(found.data.id)
    contact = {
      name: String(found.data.name),
      roleTitle: found.data.role_title ?? null,
      organization: found.data.organization ?? null,
      relationship: String(found.data.relationship_type),
      notes: found.data.notes ? String(found.data.notes).slice(0, 1000) : null,
    }
    applicationId ??= found.data.application_id ? String(found.data.application_id) : null
  }

  let job: DraftContext["job"] = null
  let analysisId: string | null = null
  let requirements: string[] = []
  if (applicationId) {
    const application = await supabase
      .from("applications")
      .select("id, job_title, status, company_id")
      .eq("id", applicationId)
      .eq("user_id", userId)
      .maybeSingle()
    if (!application.data) return { ok: false, message: "That application could not be found." }
    const company = await supabase.from("companies").select("name").eq("id", application.data.company_id).eq("user_id", userId).maybeSingle()
    job = { title: String(application.data.job_title), company: company.data?.name ?? null, status: String(application.data.status) }
    const analysis = await supabase
      .from("job_analyses")
      .select("id, requirements")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (analysis.data) {
      analysisId = String(analysis.data.id)
      requirements = (Array.isArray(analysis.data.requirements) ? (analysis.data.requirements as Row[]) : []).map((item) => String(item.text ?? ""))
    }
  }

  let claims: ResearchClaim[] = []
  let briefId: string | null = null
  let briefQuery = supabase.from("research_briefs").select("id, claims").eq("user_id", userId)
  if (input.briefId) {
    if (!isUuid(input.briefId)) return { ok: false, message: "That brief could not be found." }
    briefQuery = briefQuery.eq("id", input.briefId)
  } else if (applicationId) {
    briefQuery = briefQuery.eq("application_id", applicationId)
  }
  if (input.briefId || applicationId) {
    const brief = await briefQuery.order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (input.briefId && !brief.data) return { ok: false, message: "That brief could not be found." }
    if (brief.data) {
      briefId = String(brief.data.id)
      claims = Array.isArray(brief.data.claims) ? (brief.data.claims as ResearchClaim[]) : []
    }
  }

  return {
    ok: true,
    context: {
      kind: input.kind,
      format: input.format,
      maxChars: input.maxChars,
      contact,
      job,
      requirements,
      claims,
      facts: input.facts,
      question: input.question,
      angle: input.angle,
    },
    links: { contactId, applicationId, analysisId, briefId },
  }
}

/** Today in the user's saved timezone, or UTC when none is saved. */
export async function userLocalDate(supabase: Supabase, userId: string, now = new Date()): Promise<string> {
  const prefs = await supabase.from("user_preferences").select("timezone").eq("user_id", userId).maybeSingle()
  const zone = typeof prefs.data?.timezone === "string" && isValidTimeZone(prefs.data.timezone) ? prefs.data.timezone : "UTC"
  return localDateInTimeZone(now, zone)
}

export async function userTimeZone(supabase: Supabase, userId: string): Promise<string> {
  const prefs = await supabase.from("user_preferences").select("timezone").eq("user_id", userId).maybeSingle()
  return typeof prefs.data?.timezone === "string" && isValidTimeZone(prefs.data.timezone) ? prefs.data.timezone : "UTC"
}
