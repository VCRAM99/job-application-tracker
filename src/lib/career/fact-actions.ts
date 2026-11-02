"use server"

import { revalidatePath } from "next/cache"

import { factSchema, isFactType } from "@/lib/ai/extraction"
import { done, fail, ready } from "@/lib/career/action-utils"
import { formText, isUuid, type RecordFormState } from "@/lib/records/form-state"

export async function supersedeCareerFact(formData: FormData): Promise<void> {
  const context = await ready()
  if (!context.ok) return
  const id = formText(formData, "factId")
  const table = formText(formData, "factTable")
  if (!isUuid(id)) return
  await context.supabase.rpc("supersede_career_fact", { p_table: table, p_fact_id: id })
  revalidatePath("/career")
}

export async function rejectCareerSuggestion(formData: FormData): Promise<void> {
  const context = await ready()
  if (!context.ok) return
  const id = formText(formData, "suggestionId")
  if (!isUuid(id)) return
  await context.supabase.rpc("reject_career_suggestion", { p_suggestion_id: id })
  revalidatePath("/career")
}

export async function acceptCareerSuggestion(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const id = formText(formData, "suggestionId")
  const factType = formText(formData, "factType")
  if (!isUuid(id) || !isFactType(factType)) return fail("That suggestion is no longer available.")
  const payload = payloadFromForm(factType, formData)
  const parsed = factSchema(factType).safeParse(payload)
  if (!parsed.success) return fail("Check the suggestion and try again. Only this item will be verified.")
  const { error } = await context.supabase.rpc("accept_career_suggestion", {
    p_suggestion_id: id,
    p_payload: parsed.data,
  })
  if (error) return fail("The suggestion could not be verified.")
  revalidatePath("/career")
  return done("Verified. Other suggestions are unchanged.")
}

export async function addManualFact(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const factType = formText(formData, "factType")
  if (!isFactType(factType)) return fail("Choose a fact type.")
  const payload = {
    ...payloadFromForm(factType, formData),
    evidence: formText(formData, "evidence") || "Added manually.",
  }
  const parsed = factSchema(factType).safeParse(payload)
  if (!parsed.success) return fail("Check the fact and try again.")
  const profile = await context.supabase
    .from("career_profiles")
    .select("id")
    .eq("user_id", context.user.id)
    .maybeSingle()
  if (!profile.data) return fail("The career profile is not available yet.")
  const row = manualRow(factType, parsed.data as Record<string, unknown>, profile.data.id)
  const facts = context.supabase as unknown as {
    from: (table: string) => {
      insert: (value: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
    }
  }
  const { error } = await facts.from(tableFor(factType)).insert(row)
  if (error) return fail("The fact could not be saved.")
  revalidatePath("/career")
  return done("Verified fact added.")
}

export async function reviewSuggestedFact(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const factId = formText(formData, "factId")
  const factType = formText(formData, "factType")
  const decision = formText(formData, "decision")
  if (!isUuid(factId) || !isFactType(factType)) return fail("That suggestion is no longer available.")
  const table = tableFor(factType)
  const facts = context.supabase as unknown as {
    from: (name: string) => {
      update: (value: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            select: (columns: string) => PromiseLike<{ data: Array<{ id: string }> | null; error: { message: string } | null }>
          }
        }
      }
    }
  }
  if (decision === "reject") {
    const rejected = await facts
      .from(table)
      .update({ verification_state: "rejected" })
      .eq("id", factId)
      .eq("verification_state", "suggested")
      .select("id")
    if (rejected.error || !rejected.data?.length) return fail("That suggestion is no longer available.")
    revalidatePath("/career")
    return done("Suggestion rejected. It was not verified.")
  }
  const primary = formText(formData, "primary").trim()
  if (!primary) return fail("Name the fact before verifying it.")
  if (factType === "skill" && primary.length > 80) return fail("Keep the skill name under 80 characters.")
  const column =
    factType === "employment" || factType === "accomplishment"
      ? "title"
      : factType === "education"
        ? "credential"
        : "name"
  const accepted = await facts
    .from(table)
    .update({
      verification_state: "user_verified",
      approved_at: new Date().toISOString(),
      [column]: primary,
    })
    .eq("id", factId)
    .eq("verification_state", "suggested")
    .select("id")
  if (accepted.error || !accepted.data?.length) return fail("That suggestion could not be verified.")
  revalidatePath("/career")
  return done("Verified. Other suggestions are unchanged.")
}

function payloadFromForm(factType: string, formData: FormData) {
  const evidence = formText(formData, "evidence")
  const startDate = formText(formData, "startDate") || null
  const endDate = formText(formData, "endDate") || null
  if (factType === "employment") {
    return {
      organization: formText(formData, "secondary"),
      title: formText(formData, "primary"),
      location: formText(formData, "location") || null,
      startDate,
      endDate,
      current: formData.get("current") === "on",
      summary: formText(formData, "summary") || null,
      evidence,
    }
  }
  if (factType === "education") {
    return {
      institution: formText(formData, "secondary"),
      credential: formText(formData, "primary"),
      fieldOfStudy: formText(formData, "summary") || null,
      startDate,
      endDate,
      summary: null,
      evidence,
    }
  }
  if (factType === "skill") {
    return {
      name: formText(formData, "primary"),
      category: formText(formData, "secondary") || null,
      evidence,
    }
  }
  if (factType === "project") {
    return {
      name: formText(formData, "primary"),
      roleTitle: formText(formData, "secondary") || null,
      url: formText(formData, "url") || null,
      summary: formText(formData, "summary") || null,
      evidence,
    }
  }
  if (factType === "accomplishment") {
    return {
      title: formText(formData, "primary"),
      summary: formText(formData, "summary") || null,
      evidence,
    }
  }
  return {
    name: formText(formData, "primary"),
    issuer: formText(formData, "secondary") || null,
    issuedOn: startDate,
    expiresOn: endDate,
    credentialUrl: formText(formData, "url") || null,
    evidence,
  }
}

function tableFor(factType: string): string {
  if (factType === "employment") return "employment_entries"
  if (factType === "education") return "education_entries"
  if (factType === "skill") return "skill_entries"
  if (factType === "project") return "project_entries"
  if (factType === "accomplishment") return "accomplishment_entries"
  return "certification_entries"
}

function manualRow(factType: string, payload: Record<string, unknown>, profileId: string) {
  const shared = {
    profile_id: profileId,
    verification_state: "user_verified",
    approved_at: new Date().toISOString(),
    evidence_excerpt: payload.evidence ?? null,
  }
  if (factType === "employment") {
    return {
      ...shared,
      organization: payload.organization,
      title: payload.title,
      location: payload.location,
      start_date: payload.startDate,
      end_date: payload.endDate,
      is_current: payload.current,
      summary: payload.summary,
    }
  }
  if (factType === "education") {
    return {
      ...shared,
      institution: payload.institution,
      credential: payload.credential,
      field_of_study: payload.fieldOfStudy,
      start_date: payload.startDate,
      end_date: payload.endDate,
      summary: payload.summary,
    }
  }
  if (factType === "skill") {
    return { ...shared, name: payload.name, category: payload.category }
  }
  if (factType === "project") {
    return {
      ...shared,
      name: payload.name,
      role_title: payload.roleTitle,
      url: payload.url,
      summary: payload.summary,
    }
  }
  if (factType === "accomplishment") {
    return { ...shared, title: payload.title, summary: payload.summary }
  }
  return {
    ...shared,
    name: payload.name,
    issuer: payload.issuer,
    issued_on: payload.issuedOn,
    expires_on: payload.expiresOn,
    credential_url: payload.credentialUrl,
  }
}
