"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { jobAnalysisEnabled } from "@/lib/ai/flags"
import { AI_ERROR_MESSAGES } from "@/lib/ai/types"
import { getAnalysis } from "@/lib/analyze/data"
import { runJobAnalysis } from "@/lib/analyze/run"
import { requireUser } from "@/lib/auth/session"
import { formText, isUuid, type RecordFormState } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

function fail(message: string): RecordFormState {
  return { status: "error", message, fieldErrors: {} }
}

function cleanLabel(value: string, max: number): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export async function startAnalysis(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  if (!jobAnalysisEnabled()) return fail(AI_ERROR_MESSAGES.features_disabled)
  const requested = formText(formData, "executionMode")
  const executionMode = requested === "managed" || requested === "byok" || requested === "local" ? requested : "byok"
  const postingId = formText(formData, "postingId")
  const applicationId = formText(formData, "applicationId")
  const resumeSourceId = formText(formData, "resumeSourceId")
  const useStoredPosting = formText(formData, "useStoredPosting") === "1"
  let jdText = formText(formData, "jdText")
  let title = cleanLabel(formText(formData, "title"), 200)
  let company = cleanLabel(formText(formData, "company"), 200)
  let source: "posting" | "pasted" | "application" = "pasted"
  let linkedPosting: string | null = null
  let linkedApplication: string | null = null

  if (applicationId) {
    if (!isUuid(applicationId)) return fail("That application is not available.")
    source = "application"
    linkedApplication = applicationId
  } else if (postingId) {
    if (!isUuid(postingId)) return fail("That posting is not available.")
    source = "posting"
    linkedPosting = postingId
  }

  if (useStoredPosting && linkedPosting) {
    const supabase = await createClient()
    const posting = await supabase
      .from("job_postings")
      .select("title, description_text, employer_id")
      .eq("id", linkedPosting)
      .maybeSingle()
    if (posting.error || !posting.data) return fail("That posting is not available.")
    jdText = typeof posting.data.description_text === "string" ? posting.data.description_text : ""
    title = title ?? cleanLabel(String(posting.data.title ?? ""), 200)
    if (!company && posting.data.employer_id) {
      const employer = await supabase
        .from("catalog_employers")
        .select("canonical_name")
        .eq("id", posting.data.employer_id)
        .maybeSingle()
      company = cleanLabel(String(employer.data?.canonical_name ?? ""), 200)
    }
  }

  const result = await runJobAnalysis({
    jdText,
    title,
    company,
    executionMode,
    source,
    postingId: linkedPosting,
    applicationId: linkedApplication,
    resumeSourceId: isUuid(resumeSourceId) ? resumeSourceId : null,
  })
  if (!result.ok) return fail(result.message)
  revalidatePath("/analyze")
  redirect(`/analyze/${result.id}${result.reused ? "?reused=1" : ""}`)
}

export async function rerunAnalysis(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const id = formText(formData, "analysisId")
  if (!isUuid(id)) return fail("That analysis is not available.")
  const loaded = await getAnalysis(id)
  if (!loaded.ok) return fail("That analysis could not be loaded.")
  if (!loaded.analysis) return fail("That analysis is not available.")
  const analysis = loaded.analysis
  const requested = formText(formData, "executionMode")
  const result = await runJobAnalysis({
    jdText: analysis.jdText,
    title: analysis.title,
    company: analysis.company,
    executionMode: requested === "managed" || requested === "byok" ? requested : analysis.executionMode ?? "byok",
    source: analysis.source,
    postingId: analysis.postingId,
    applicationId: analysis.applicationId,
    resumeSourceId: analysis.resumeSourceId,
  })
  if (!result.ok) return fail(result.message)
  revalidatePath("/analyze")
  redirect(`/analyze/${result.id}${result.reused ? "?reused=1" : ""}`)
}

export async function claimRequirement(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  if (!jobAnalysisEnabled()) return fail(AI_ERROR_MESSAGES.features_disabled)
  const analysisId = formText(formData, "analysisId")
  const requirementId = formText(formData, "requirementId")
  if (!isUuid(analysisId) || !/^req-\d+$/.test(requirementId)) return fail("That requirement is not available.")
  const loaded = await getAnalysis(analysisId)
  if (!loaded.ok || !loaded.analysis) return fail("That analysis is not available.")
  const requirement = loaded.analysis.requirements.find((item) => item.id === requirementId)
  if (!requirement) return fail("That requirement is not available.")
  if (loaded.analysis.claims.some((claim) => claim.requirementId === requirementId)) {
    redirect("/career#suggestions")
  }
  const user = await requireUser()
  const supabase = await createClient()
  const profile = await supabase.from("career_profiles").select("id").eq("user_id", user.id).maybeSingle()
  let profileId = profile.data?.id ? String(profile.data.id) : null
  if (!profileId) {
    const created = await supabase.from("career_profiles").insert({ user_id: user.id }).select("id").maybeSingle()
    profileId = created.data?.id ? String(created.data.id) : null
  }
  if (!profileId) return fail("The career profile is not available yet.")
  const name = (requirement.normalizedSkills[0] || requirement.text).trim().slice(0, 80)
  const provenance = { analysisId, requirementId }
  const inserted = await supabase
    .from("skill_entries")
    .insert({
      profile_id: profileId,
      verification_state: "suggested",
      name: name || "Suggested skill",
      category: requirement.category,
      evidence_excerpt: `Suggested from a job analysis. ${requirement.evidenceQuote}`.slice(0, 500),
      provenance,
    })
    .select("id")
    .maybeSingle()
  if (inserted.error || !inserted.data) return fail("The suggestion could not be saved.")
  const claims = [
    ...loaded.analysis.claims,
    { requirementId, factId: String(inserted.data.id), factTable: "skill_entries" },
  ]
  const updated = await supabase.from("job_analyses").update({ gap_claims: claims }).eq("id", analysisId)
  if (updated.error) return fail("The suggestion was saved, but the analysis could not record it. Review it on Career.")
  revalidatePath("/career")
  revalidatePath(`/analyze/${analysisId}`)
  redirect("/career#suggestions")
}
