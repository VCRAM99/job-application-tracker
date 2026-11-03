"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { prepareAiRun, usageReservationDeps } from "@/lib/ai/run-context"
import { AiRequestError } from "@/lib/ai/types"
import { DRAFT_FORMATS, FORMAT_LIMITS, type DraftFormat } from "@/lib/ai/verify"
import { fingerprintOf, loadVerifiedFacts } from "@/lib/analyze/data"
import { requireUser } from "@/lib/auth/session"
import { aiFailure, done, fail, field, idempotencyKey, requestNonce, requestedMode } from "@/lib/coach/action-utils"
import {
  COACH_SCHEMA_VERSION,
  DRAFT_KINDS,
  DRAFT_PROMPT_VERSION,
  PASTED_SOURCE_MIN,
  RESEARCH_PROMPT_VERSION,
  SOURCE_TEXT_MAX,
  type DraftKind,
} from "@/lib/coach/constants"
import { loadDraftContext, userLocalDate } from "@/lib/coach/context"
import { getDraft } from "@/lib/coach/data"
import { droppedTotal, KIND_FORMATS, type DraftOutcome } from "@/lib/coach/drafts"
import { numberSources, type SourceKind } from "@/lib/coach/research"
import { generateBrief, generateDraft } from "@/lib/coach/run"
import { isUuid, type RecordFormState } from "@/lib/records/form-state"
import { sliceChars } from "@/lib/resume/text"
import { createClient } from "@/lib/supabase/server"
import { coachAllowed } from "@/lib/beta"

const OFF = "Career coach is turned off."

function saveFailed(what: string, code: string | undefined): never {
  console.error(`${what} not saved (${code ?? "no code"}).`)
  throw new AiRequestError("transient", { retryable: false })
}

function revalidateDraftLinks(links: { contactId?: string | null; applicationId?: string | null }) {
  revalidatePath("/networking")
  if (links.contactId) revalidatePath(`/networking/${links.contactId}`)
  if (links.applicationId) revalidatePath(`/applications/${links.applicationId}`)
}

/**
 * Builds a brief from user-provided text only: the analyzed job description,
 * the user's own company record and notes, the catalog employer fields of a
 * linked posting, and text pasted now. Nothing is fetched from the web.
 */
export async function createResearchBrief(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const applicationId = String(formData.get("applicationId") ?? "")
  const pasted = field(formData, "pasted", SOURCE_TEXT_MAX + 1)
  if (pasted.length > SOURCE_TEXT_MAX) return fail(`Paste at most ${SOURCE_TEXT_MAX.toLocaleString("en-US")} characters.`)
  if (!isUuid(applicationId)) return fail("Open research from an application.")
  const supabase = await createClient()
  const application = await supabase.from("applications").select("id, job_title, company_id").eq("id", applicationId).eq("user_id", user.id).maybeSingle()
  if (!application.data) return fail("That application could not be found.")
  const companyId = String(application.data.company_id)
  const jobTitle = String(application.data.job_title)
  const [company, analysis, link] = await Promise.all([
    supabase.from("companies").select("name, industry, location, size, notes").eq("id", companyId).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("job_analyses")
      .select("jd_text")
      .eq("user_id", user.id)
      .eq("application_id", applicationId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("application_postings").select("posting_id").eq("user_id", user.id).eq("application_id", applicationId).maybeSingle(),
  ])
  const companyName = company.data?.name ? String(company.data.name) : null
  let posting: { id: string; description: string | null; employer: string | null } | null = null
  if (link.data?.posting_id) {
    const found = await supabase.from("job_postings").select("id, description_text, employer_id").eq("id", link.data.posting_id).maybeSingle()
    if (found.data) {
      let employer: string | null = null
      if (found.data.employer_id) {
        const row = await supabase.from("catalog_employers").select("canonical_name, website_domain, country_code").eq("id", found.data.employer_id).maybeSingle()
        if (row.data) {
          employer = [`Employer: ${row.data.canonical_name}.`, row.data.website_domain ? `Website domain: ${row.data.website_domain}.` : "", row.data.country_code ? `Country: ${row.data.country_code}.` : ""]
            .filter(Boolean)
            .join(" ")
        }
      }
      posting = { id: String(found.data.id), description: found.data.description_text ?? null, employer }
    }
  }
  const companyText = company.data
    ? [
        `Company: ${company.data.name}.`,
        company.data.industry ? `Industry: ${company.data.industry}.` : "",
        company.data.location ? `Location: ${company.data.location}.` : "",
        company.data.notes ? `Notes: ${company.data.notes}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : null
  const candidates: Array<{ kind: SourceKind; label: string; text: string | null | undefined }> = [
    { kind: "pasted", label: "Pasted text", text: pasted },
    { kind: "job_description", label: "Job description", text: analysis.data?.jd_text ?? posting?.description },
    { kind: "company_notes", label: "Your company notes", text: companyText },
    { kind: "catalog_employer", label: "Catalog employer", text: posting?.employer },
  ]
  const sources = numberSources(candidates)
  const total = sources.reduce((sum, source) => sum + source.text.length, 0)
  if (total < PASTED_SOURCE_MIN) return fail("Paste some company text first, or add notes to the company.")

  const prepared = await prepareAiRun(supabase, user.id, requestedMode(formData))
  if (!prepared.ok) return fail(prepared.message)
  const run = prepared.run
  const key = idempotencyKey([
    "coach-research", user.id, applicationId, ...sources.map((source) => source.sha256), RESEARCH_PROMPT_VERSION, run.mode, run.provider, run.model, requestNonce(formData),
  ])
  let briefId: string | null = null
  const result = await generateBrief({
    run,
    reservation: usageReservationDeps(supabase, { userId: user.id, secret: run.secret, idempotencyKey: key, mode: run.mode, provider: run.provider, model: run.model }),
    company: companyName,
    sources,
    persist: async (outcome, modelUsed) => {
      const inserted = await supabase
        .from("research_briefs")
        .insert({
          company_id: companyId,
          application_id: applicationId,
          posting_id: posting?.id ?? null,
          label: sliceChars(`Research · ${companyName ?? jobTitle}`, 160),
          sources,
          claims: outcome.claims,
          dropped: outcome.dropped,
          prompt_version: RESEARCH_PROMPT_VERSION,
          schema_version: COACH_SCHEMA_VERSION,
          provider: run.provider,
          model: modelUsed,
          execution_mode: run.mode,
        })
        .select("id")
        .single()
      if (inserted.error) saveFailed("Research brief", inserted.error.code)
      briefId = String(inserted.data.id)
    },
  })
  if (!result.ok) return aiFailure(result.code, result.message)
  if (result.kind === "already-complete") {
    const latest = await supabase.from("research_briefs").select("id").eq("user_id", user.id).eq("application_id", applicationId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    briefId = latest.data ? String(latest.data.id) : null
  }
  if (!briefId) return fail("The brief could not be saved. Reload and try again.")
  revalidatePath(`/applications/${applicationId}`)
  redirect(`/research/${briefId}`)
}

function readKind(value: string): DraftKind | null {
  return (DRAFT_KINDS as readonly string[]).includes(value) ? (value as DraftKind) : null
}

function readFormat(value: string, kind: DraftKind): DraftFormat | null {
  if (!(DRAFT_FORMATS as readonly string[]).includes(value)) return KIND_FORMATS[kind][KIND_FORMATS[kind].length - 1] ?? null
  return KIND_FORMATS[kind].includes(value as DraftFormat) ? (value as DraftFormat) : null
}

type DraftRequest = {
  kind: DraftKind
  format: DraftFormat
  contactId: string
  applicationId: string
  briefId: string
  question: string | null
  angle: string | null
  maxChars?: number
}

async function runDraft(
  formData: FormData,
  request: DraftRequest,
  save: (outcome: DraftOutcome, meta: { links: { contactId: string | null; applicationId: string | null; analysisId: string | null; briefId: string | null }; run: { provider: string; model: string; mode: string } }) => Promise<void>,
): Promise<RecordFormState | null> {
  const user = await requireUser()
  const facts = await loadVerifiedFacts()
  if (!facts.ok) return fail("Verified career facts could not be loaded.")
  const supabase = await createClient()
  const loaded = await loadDraftContext(supabase, user.id, { ...request, facts: facts.facts })
  if (!loaded.ok) return fail(loaded.message)
  if (request.kind === "application_answer" && !loaded.links.applicationId) return fail("Application answers belong to an application.")
  const prepared = await prepareAiRun(supabase, user.id, requestedMode(formData))
  if (!prepared.ok) return fail(prepared.message)
  const run = prepared.run
  const key = idempotencyKey([
    "coach-draft", user.id, request.kind, request.format, loaded.links.contactId, loaded.links.applicationId, loaded.links.briefId, request.question, request.angle,
    request.maxChars, fingerprintOf(facts.facts), DRAFT_PROMPT_VERSION, run.mode, run.provider, run.model, requestNonce(formData),
  ])
  let empty = null as DraftOutcome | null
  const result = await generateDraft({
    run,
    reservation: usageReservationDeps(supabase, { userId: user.id, secret: run.secret, idempotencyKey: key, mode: run.mode, provider: run.provider, model: run.model }),
    context: loaded.context,
    persist: async (outcome, modelUsed) => {
      if (!outcome.body.trim()) {
        empty = outcome
        return
      }
      await save(outcome, { links: loaded.links, run: { provider: run.provider, model: modelUsed, mode: run.mode } })
    },
  })
  if (!result.ok) return aiFailure(result.code, result.message)
  if (result.kind === "already-complete") return fail("This draft was already generated. Reload to see it.")
  if (empty) return fail(`No sentence passed the checks (${droppedTotal(empty.validation.dropped)} dropped). Nothing was saved.`)
  return null
}

/** Drafts outreach, a follow-up, a thank-you, a referral request, or an application answer. Nothing is sent. */
export async function createDraft(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const kind = readKind(String(formData.get("kind") ?? ""))
  if (!kind) return fail("Choose what to draft.")
  const format = readFormat(String(formData.get("format") ?? ""), kind)
  if (!format) return fail("That format is not available for this draft.")
  const question = kind === "application_answer" ? field(formData, "question", 2001) : ""
  if (kind === "application_answer" && (question.length < 5 || question.length > 2000)) return fail("Paste the application question (up to 2,000 characters).")
  const requestedMax = Number(formData.get("maxChars") ?? "")
  const maxChars = Number.isInteger(requestedMax) && requestedMax >= 100 && requestedMax <= FORMAT_LIMITS[format] ? requestedMax : undefined
  const request: DraftRequest = {
    kind,
    format,
    contactId: String(formData.get("contactId") ?? ""),
    applicationId: String(formData.get("applicationId") ?? ""),
    briefId: String(formData.get("briefId") ?? ""),
    question: question || null,
    angle: field(formData, "angle", 500) || null,
    maxChars,
  }
  const supabase = await createClient()
  let draftId: string | null = null
  let links: { contactId: string | null; applicationId: string | null } = { contactId: null, applicationId: null }
  const failed = await runDraft(formData, request, async (outcome, meta) => {
    const inserted = await supabase
      .from("coach_drafts")
      .insert({
        kind,
        format,
        contact_id: meta.links.contactId,
        application_id: meta.links.applicationId,
        analysis_id: meta.links.analysisId,
        brief_id: meta.links.briefId,
        prompt_text: request.question,
        subject: outcome.subject,
        body: outcome.body,
        fact_ids: outcome.factIds,
        validation: outcome.validation,
        prompt_version: DRAFT_PROMPT_VERSION,
        schema_version: COACH_SCHEMA_VERSION,
        provider: meta.run.provider,
        model: meta.run.model,
        execution_mode: meta.run.mode,
      })
      .select("id")
      .single()
    if (inserted.error) saveFailed("Draft", inserted.error.code)
    draftId = String(inserted.data.id)
    links = meta.links
  })
  if (failed) return failed
  if (!draftId) return fail("The draft could not be saved.")
  revalidateDraftLinks(links)
  redirect(`/drafts/${draftId}`)
}

/** Replaces a draft's text with a new generation from the same inputs. Only drafts not marked sent can change. */
export async function regenerateDraft(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const draft = await getDraft(String(formData.get("draftId") ?? ""))
  if (!draft) return fail("That draft could not be found.")
  if (draft.status !== "draft") return fail("Only an unsent draft can be regenerated.")
  const supabase = await createClient()
  const failed = await runDraft(
    formData,
    {
      kind: draft.kind,
      format: draft.format,
      contactId: draft.contactId ?? "",
      applicationId: draft.applicationId ?? "",
      briefId: draft.briefId ?? "",
      question: draft.promptText,
      angle: field(formData, "angle", 500) || null,
    },
    async (outcome, meta) => {
      const saved = await supabase
        .from("coach_drafts")
        .update({
          subject: outcome.subject,
          body: outcome.body,
          fact_ids: outcome.factIds,
          validation: outcome.validation,
          analysis_id: meta.links.analysisId,
          brief_id: meta.links.briefId,
          prompt_version: DRAFT_PROMPT_VERSION,
          provider: meta.run.provider,
          model: meta.run.model,
          execution_mode: meta.run.mode,
        })
        .eq("id", draft.id)
        .eq("user_id", user.id)
        .eq("status", "draft")
      if (saved.error) saveFailed("Draft", saved.error.code)
    },
  )
  if (failed) return failed
  revalidatePath(`/drafts/${draft.id}`)
  revalidateDraftLinks(draft)
  return done("Regenerated.")
}

/**
 * The only way a draft becomes "sent": the user clicks Mark as sent. It sets
 * the draft's status and, for a linked contact, its outreach status and last
 * contacted date, in one database call scoped to the caller.
 */
export async function markDraftSent(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const draftId = String(formData.get("draftId") ?? "")
  if (!isUuid(draftId) || formData.get("confirm") !== "sent") return fail("That draft could not be marked sent.")
  const supabase = await createClient()
  const localDate = await userLocalDate(supabase, user.id)
  const marked = await supabase.rpc("mark_coach_draft_sent", { p_draft_id: draftId, p_local_date: localDate })
  if (marked.error) return fail(marked.error.message.includes("archived") ? "An archived draft cannot be marked sent." : "That draft could not be marked sent.")
  const draft = await getDraft(draftId)
  revalidatePath(`/drafts/${draftId}`)
  if (draft) revalidateDraftLinks(draft)
  const data = marked.data as { contact_updated?: boolean; already_sent?: boolean } | null
  if (data?.already_sent) return done("Already marked sent.")
  return done(data?.contact_updated ? "Marked sent. Contact updated." : "Marked sent.")
}

export async function setDraftArchived(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const draftId = String(formData.get("draftId") ?? "")
  const archive = formData.get("archive") !== "false"
  if (!isUuid(draftId)) return fail("That draft could not be found.")
  const supabase = await createClient()
  const saved = await supabase
    .from("coach_drafts")
    .update({ status: archive ? "archived" : "draft" })
    .eq("id", draftId)
    .eq("user_id", user.id)
    .eq("status", archive ? "draft" : "archived")
    .select("contact_id, application_id")
  if (saved.error || !saved.data?.length) return fail("That draft could not be updated.")
  revalidatePath(`/drafts/${draftId}`)
  revalidateDraftLinks({ contactId: saved.data[0]?.contact_id, applicationId: saved.data[0]?.application_id })
  return done(archive ? "Archived." : "Restored.")
}

export async function deleteDraft(formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const draftId = String(formData.get("draftId") ?? "")
  if (!isUuid(draftId)) return fail("That draft could not be found.")
  const supabase = await createClient()
  const removed = await supabase.from("coach_drafts").delete().eq("id", draftId).eq("user_id", user.id).select("contact_id, application_id")
  if (removed.error || !removed.data?.length) return fail("That draft could not be deleted.")
  revalidateDraftLinks({ contactId: removed.data[0]?.contact_id, applicationId: removed.data[0]?.application_id })
  return done("Deleted.")
}

export async function deleteBrief(formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const briefId = String(formData.get("briefId") ?? "")
  if (!isUuid(briefId)) return fail("That brief could not be found.")
  const supabase = await createClient()
  const removed = await supabase.from("research_briefs").delete().eq("id", briefId).eq("user_id", user.id).select("application_id")
  if (removed.error || !removed.data?.length) return fail("That brief could not be deleted.")
  if (removed.data[0]?.application_id) revalidatePath(`/applications/${removed.data[0].application_id}`)
  return done("Deleted.")
}
