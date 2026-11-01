"use server"

import { createHash } from "node:crypto"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { prepareAiRun, usageReservationDeps } from "@/lib/ai/run-context"
import { AI_ERROR_MESSAGES } from "@/lib/ai/types"
import { jobAnalysisEnabled } from "@/lib/ai/flags"
import { fingerprintOf, getAnalysis, loadVerifiedFacts } from "@/lib/analyze/data"
import { readabilityReport } from "@/lib/analyze/readability"
import { requireUser } from "@/lib/auth/session"
import { isUuid, type RecordFormState } from "@/lib/records/form-state"
import { TAILOR_PROMPT_VERSION, TAILOR_SCHEMA_VERSION } from "@/lib/resume/constants"
import { contentToText, resumeContentSchema, type ResumeContent } from "@/lib/resume/content"
import { resumeStudioEnabled } from "@/lib/resume/flags"
import { tailorResumeContent } from "@/lib/resume/run-tailor"
import { applyEdits, type EditStatus, type ResumeEdit } from "@/lib/resume/tailor"
import { createClient } from "@/lib/supabase/server"

function fail(message: string): RecordFormState {
  return { status: "error", message, fieldErrors: {} }
}

function mode(formData: FormData): "managed" | "byok" | "local" {
  const value = String(formData.get("executionMode") ?? "")
  return value === "managed" || value === "local" ? value : "byok"
}

/**
 * Tailors a parsed resume to a completed analysis. The model proposes an edit
 * list; validateEdits keeps only edits that pass every check. The version
 * starts with every kept edit pending and the final content equal to the base.
 */
export async function tailorResume(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!resumeStudioEnabled() || !jobAnalysisEnabled()) return fail("Resume tailoring is turned off.")
  const user = await requireUser()
  const resumeId = String(formData.get("resumeId") ?? "")
  const analysisId = String(formData.get("analysisId") ?? "")
  const applicationId = String(formData.get("applicationId") ?? "")
  if (!isUuid(resumeId) || !isUuid(analysisId)) return fail("Choose a parsed resume and a completed analysis.")
  const supabase = await createClient()
  const resume = await supabase
    .from("resumes")
    .select("id, sha256, parsed, parse_status, parse_prompt_version")
    .eq("id", resumeId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (resume.error || !resume.data || resume.data.parse_status !== "parsed") return fail("Parse this resume before tailoring it.")
  const parsed = resumeContentSchema.safeParse(resume.data.parsed)
  if (!parsed.success) return fail("Parse this resume again before tailoring it.")
  const content = parsed.data as ResumeContent
  const analysis = await getAnalysis(analysisId)
  if (!analysis.ok || !analysis.analysis || analysis.analysis.status !== "complete") return fail("Choose a completed analysis.")
  const facts = await loadVerifiedFacts()
  if (!facts.ok) return fail("Verified career facts could not be loaded.")

  const prepared = await prepareAiRun(supabase, user.id, mode(formData))
  if (!prepared.ok) return fail(prepared.message)
  const run = prepared.run
  const idempotencyKey = createHash("sha256")
    .update(
      [
        "resume-tailor",
        user.id,
        resume.data.sha256,
        resume.data.parse_prompt_version,
        analysisId,
        fingerprintOf(facts.facts),
        TAILOR_PROMPT_VERSION,
        run.mode,
        run.provider,
        run.model,
      ].join("\n"),
    )
    .digest("hex")
  const record = analysis.analysis
  const baseText = contentToText(content)
  let versionId: string | null = null

  const result = await tailorResumeContent({
    content,
    requirements: record.requirements,
    matches: record.matches,
    facts: facts.facts,
    run,
    reservation: usageReservationDeps(supabase, { userId: user.id, secret: run.secret, idempotencyKey, mode: run.mode, provider: run.provider, model: run.model }),
    persist: async (outcome) => {
      const readability = readabilityReport(resumeId, baseText, record.requirements)
      const inserted = await supabase
        .from("resume_versions")
        .insert({
          user_id: user.id,
          resume_id: resumeId,
          analysis_id: analysisId,
          application_id: isUuid(applicationId) ? applicationId : (record.applicationId ?? null),
          label: [record.title || "Tailored resume", record.company].filter(Boolean).join(" · ").slice(0, 160),
          base_content: content,
          edits: outcome.edits,
          final_content: content,
          dropped: outcome.dropped,
          readability_before: readability,
          readability_after: readability,
          prompt_version: TAILOR_PROMPT_VERSION,
          schema_version: TAILOR_SCHEMA_VERSION,
          provider: run.provider,
          model: run.model,
          execution_mode: run.mode,
        })
        .select("id")
        .single()
      if (inserted.error) {
        console.error(`Resume version not saved (${inserted.error.code ?? "no code"}).`)
        throw new Error("persist_failed")
      }
      versionId = String(inserted.data.id)
    },
  })

  if (!result.ok) return fail(AI_ERROR_MESSAGES[result.code] ?? result.message)
  if (result.kind === "already-complete") {
    const latest = await supabase
      .from("resume_versions")
      .select("id")
      .eq("user_id", user.id)
      .eq("resume_id", resumeId)
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    versionId = latest.data ? String(latest.data.id) : null
  }
  if (!versionId) return fail("This tailoring already finished. Open it from the resume page.")
  revalidatePath(`/resumes/${resumeId}`)
  redirect(`/resumes/${resumeId}/versions/${versionId}`)
}

/** Sets one edit's status, or every pending edit with editId "all", and recomputes the final content on the server. */
export async function decideEdit(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!resumeStudioEnabled()) return fail("Resume Studio is turned off.")
  const user = await requireUser()
  const versionId = String(formData.get("versionId") ?? "")
  const editId = String(formData.get("editId") ?? "")
  const status = String(formData.get("status") ?? "") as EditStatus
  if (!isUuid(versionId) || !["pending", "accepted", "rejected"].includes(status)) return fail("That edit could not be updated.")
  const supabase = await createClient()
  const version = await supabase
    .from("resume_versions")
    .select("id, resume_id, base_content, edits, analysis_id")
    .eq("id", versionId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (version.error || !version.data) return fail("That version could not be found.")
  const edits = (version.data.edits as ResumeEdit[]).map((edit) =>
    editId === "all" ? (edit.status === "pending" ? { ...edit, status } : edit) : edit.id === editId ? { ...edit, status } : edit,
  )
  const base = version.data.base_content as ResumeContent
  const final = applyEdits(base, edits)
  let requirements: Parameters<typeof readabilityReport>[2] = []
  if (version.data.analysis_id) {
    const analysis = await getAnalysis(String(version.data.analysis_id))
    if (analysis.ok && analysis.analysis) requirements = analysis.analysis.requirements
  }
  const saved = await supabase
    .from("resume_versions")
    .update({
      edits,
      final_content: final,
      readability_after: readabilityReport(String(version.data.resume_id ?? versionId), contentToText(final), requirements),
    })
    .eq("id", versionId)
    .eq("user_id", user.id)
  if (saved.error) return fail("That edit could not be updated.")
  revalidatePath(`/resumes/${version.data.resume_id ?? ""}/versions/${versionId}`)
  return { status: "idle", message: null, fieldErrors: {} }
}

/** Links a version to one of the user's applications, or clears the link. */
export async function linkVersion(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!resumeStudioEnabled()) return fail("Resume Studio is turned off.")
  const user = await requireUser()
  const versionId = String(formData.get("versionId") ?? "")
  const applicationId = String(formData.get("applicationId") ?? "")
  if (!isUuid(versionId) || (applicationId && !isUuid(applicationId))) return fail("Choose an application.")
  const supabase = await createClient()
  const saved = await supabase
    .from("resume_versions")
    .update({ application_id: applicationId || null })
    .eq("id", versionId)
    .eq("user_id", user.id)
  if (saved.error) return fail(saved.error.code === "23503" ? "That application could not be found." : "The link could not be saved.")
  revalidatePath("/applications")
  return { status: "idle", message: applicationId ? "Linked." : "Unlinked.", fieldErrors: {} }
}
