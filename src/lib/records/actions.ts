"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/auth/session"
import { linkedApplicationId, loadTrackerPosting } from "@/lib/jobs/data"
import { companyChoiceIsExplicit, planCompany } from "@/lib/jobs/prefill"
import { isApplicationStatus } from "@/lib/records/constants"
import type { CompanyFormValues, ApplicationFormValues } from "@/lib/records/schemas"
import {
  applicationFormSchema,
  companyFormSchema,
  fieldErrorsFrom,
} from "@/lib/records/schemas"
import {
  formText,
  initialRecordFormState,
  isUuid,
  safeRecordPath,
  type RecordFormState,
} from "@/lib/records/form-state"
import { assertDeleted, recordErrorMessage, statusChangeDecision } from "@/lib/records/logic"
import { createClient } from "@/lib/supabase/server"

function companyPayload(userId: string, values: CompanyFormValues) {
  return {
    user_id: userId,
    name: values.name,
    size: values.size,
    location: values.location,
    industry: values.industry,
    research_status: values.researchStatus,
    priority_tier: values.priorityTier,
    reference: values.reference,
    website_url: values.websiteUrl,
    notes: values.notes,
    follow_up_date: values.followUpDate,
  }
}

function applicationPayload(userId: string, companyId: string, values: ApplicationFormValues) {
  return {
    user_id: userId,
    company_id: companyId,
    job_title: values.jobTitle,
    job_url: values.jobUrl,
    source: values.source,
    location: values.location,
    work_arrangement: values.workArrangement,
    employment_type: values.employmentType,
    salary_min: values.salaryMin,
    salary_max: values.salaryMax,
    salary_currency: values.salaryCurrency,
    status: values.status,
    applied_at: values.appliedAt,
    next_follow_up_date: values.nextFollowUpDate,
    notes: values.notes,
  }
}

function parseCompany(formData: FormData) {
  return companyFormSchema.safeParse({
    name: formText(formData, "name"),
    size: formText(formData, "size"),
    location: formText(formData, "location"),
    industry: formText(formData, "industry"),
    researchStatus: formText(formData, "researchStatus"),
    priorityTier: formText(formData, "priorityTier"),
    reference: formText(formData, "reference"),
    websiteUrl: formText(formData, "websiteUrl"),
    notes: formText(formData, "notes"),
    followUpDate: formText(formData, "followUpDate"),
  })
}

function parseApplication(formData: FormData) {
  return applicationFormSchema.safeParse({
    jobTitle: formText(formData, "jobTitle"),
    jobUrl: formText(formData, "jobUrl"),
    source: formText(formData, "source"),
    location: formText(formData, "location"),
    workArrangement: formText(formData, "workArrangement"),
    employmentType: formText(formData, "employmentType"),
    salaryMin: formText(formData, "salaryMin"),
    salaryMax: formText(formData, "salaryMax"),
    salaryCurrency: formText(formData, "salaryCurrency"),
    status: formText(formData, "status"),
    appliedAt: formText(formData, "appliedAt"),
    nextFollowUpDate: formText(formData, "nextFollowUpDate"),
    notes: formText(formData, "notes"),
    companyMode: formText(formData, "companyMode"),
    companyId: formText(formData, "companyId"),
    newCompanyName: formText(formData, "newCompanyName"),
  })
}

async function resolveCompanyId(
  userId: string,
  values: ApplicationFormValues,
): Promise<{ companyId: string; created: boolean } | RecordFormState> {
  const supabase = await createClient()

  if (values.companyMode === "existing") {
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", userId)
      .eq("id", values.companyId)
      .maybeSingle()

    if (error) {
      return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
    }
    if (!data) {
      return {
        status: "error",
        message: null,
        fieldErrors: { companyId: "Choose one of your companies." },
      }
    }
    return { companyId: data.id, created: false }
  }

  const { data, error } = await supabase
    .from("companies")
    .insert({ user_id: userId, name: values.newCompanyName })
    .select("id")
    .single()

  if (error || !data) {
    return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  }

  return { companyId: data.id, created: true }
}

export async function createCompany(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const parsed = parseCompany(formData)
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the form and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("companies")
    .insert(companyPayload(user.id, parsed.data))
    .select("id")
    .single()

  if (error || !data) {
    return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  }

  revalidatePath("/companies")
  revalidatePath("/dashboard")
  redirect(`/companies/${data.id}`)
}

export async function updateCompany(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) {
    return { status: "error", message: "That company could not be found.", fieldErrors: {} }
  }

  const parsed = parseCompany(formData)
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the form and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("companies")
    .update(companyPayload(user.id, parsed.data))
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle()

  if (error) {
    return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  }
  if (!data) {
    return { status: "error", message: "That company could not be found.", fieldErrors: {} }
  }

  revalidatePath("/companies")
  revalidatePath("/dashboard")
  revalidatePath(`/companies/${id}`)
  redirect(`/companies/${id}`)
}

export async function deleteCompany(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) redirect("/companies")

  const supabase = await createClient()
  const { error } = await supabase.from("companies").delete().eq("user_id", user.id).eq("id", id)
  assertDeleted(error)
  revalidatePath("/companies")
  revalidatePath("/dashboard")
  revalidatePath("/applications")
  redirect("/companies")
}

export async function createApplication(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const parsed = parseApplication(formData)
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the form and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    }
  }

  const postingId = formText(formData, "postingId")
  const tracked = isUuid(postingId)
  const values = tracked ? { ...parsed.data, status: "saved" as const, appliedAt: null } : parsed.data
  const supabase = await createClient()
  if (tracked) {
    const linked = await linkedApplicationId(postingId)
    if (linked) redirect(`/applications/${linked}`)
    const posting = await loadTrackerPosting(postingId)
    if (!posting.ok) {
      return {
        status: "error",
        message:
          posting.error === "missing_table"
            ? "Recommended jobs are not available yet. Apply the latest migration, then reload."
            : "That recommended job could not be loaded.",
        fieldErrors: {},
      }
    }
    if (posting.data?.employerName) {
      const owned = await supabase.from("companies").select("id, name").eq("user_id", user.id)
      if (owned.error) {
        return { status: "error", message: recordErrorMessage(owned.error), fieldErrors: {} }
      }
      const plan = planCompany(owned.data ?? [], posting.data.employerName)
      if (!companyChoiceIsExplicit(plan, { mode: values.companyMode, companyId: values.companyId })) {
        return {
          status: "error",
          message: null,
          fieldErrors: {
            companyId: "Several of your companies share this name. Choose one, or create a new company.",
          },
        }
      }
    }
    if (values.jobUrl) {
      const duplicate = await supabase.rpc("find_application_duplicate", {
        p_title: values.jobTitle,
        p_url: values.jobUrl,
      })
      if (duplicate.error) {
        return {
          status: "error",
          message:
            duplicate.error.code === "PGRST202"
              ? "Recommended jobs are not available yet. Apply the latest migration, then reload."
              : recordErrorMessage(duplicate.error),
          fieldErrors: {},
        }
      }
      if (duplicate.data) {
        return {
          status: "error",
          message: "You already have an application with this title and URL.",
          fieldErrors: {},
        }
      }
    }
  }

  const company = await resolveCompanyId(user.id, values)
  if ("status" in company) return company

  const { data, error } = await supabase
    .from("applications")
    .insert(applicationPayload(user.id, company.companyId, values))
    .select("id")
    .single()

  if (error || !data) {
    if (company.created) {
      await supabase.from("companies").delete().eq("user_id", user.id).eq("id", company.companyId)
    }
    if (error?.code === "23505" && /applications_user_match_key_idx/.test(error.message ?? "")) {
      return {
        status: "error",
        message: "You already have an application with this title and URL.",
        fieldErrors: {},
      }
    }
    return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  }

  if (tracked) {
    const link = await supabase.from("application_postings").insert({
      user_id: user.id,
      application_id: data.id,
      posting_id: postingId,
    })
    if (link.error) {
      await supabase.from("applications").delete().eq("user_id", user.id).eq("id", data.id)
      if (company.created) {
        await supabase.from("companies").delete().eq("user_id", user.id).eq("id", company.companyId)
      }
      if (link.error.code === "23505") {
        const winner = await linkedApplicationId(postingId)
        if (winner) redirect(`/applications/${winner}`)
      }
      return { status: "error", message: recordErrorMessage(link.error), fieldErrors: {} }
    }
  }

  revalidatePath("/applications")
  revalidatePath("/companies")
  revalidatePath("/dashboard")
  redirect(`/applications/${data.id}`)
}

export async function updateApplication(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) {
    return { status: "error", message: "That application could not be found.", fieldErrors: {} }
  }

  const parsed = parseApplication(formData)
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the form and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    }
  }

  const supabase = await createClient()
  const existing = await supabase
    .from("applications")
    .select("status")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle()

  if (existing.error) {
    return { status: "error", message: recordErrorMessage(existing.error), fieldErrors: {} }
  }
  if (!existing.data || !isApplicationStatus(existing.data.status)) {
    return { status: "error", message: "That application could not be found.", fieldErrors: {} }
  }

  const decision = statusChangeDecision({
    from: existing.data.status,
    to: parsed.data.status,
  })
  if (!decision.ok) {
    return {
      status: "error",
      message: null,
      fieldErrors: { status: decision.message },
    }
  }

  const company = await resolveCompanyId(user.id, parsed.data)
  if ("status" in company) return company

  const { data, error } = await supabase
    .from("applications")
    .update(applicationPayload(user.id, company.companyId, parsed.data))
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle()

  if (error || !data) {
    if (company.created) {
      await supabase.from("companies").delete().eq("user_id", user.id).eq("id", company.companyId)
    }
    return {
      status: "error",
      message: error ? recordErrorMessage(error) : "That application could not be found.",
      fieldErrors: {},
    }
  }

  revalidatePath("/applications")
  revalidatePath(`/applications/${id}`)
  revalidatePath("/companies")
  revalidatePath("/dashboard")
  redirect(`/applications/${id}`)
}

export async function updateApplicationStatus(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const id = formText(formData, "id")
  const nextStatus = formText(formData, "status")
  if (!isUuid(id) || !isApplicationStatus(nextStatus)) {
    return { ...initialRecordFormState, status: "error", message: "Choose a valid status." }
  }

  const supabase = await createClient()
  const existing = await supabase
    .from("applications")
    .select("status")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle()

  if (existing.error) {
    return { status: "error", message: recordErrorMessage(existing.error), fieldErrors: {} }
  }
  if (!existing.data || !isApplicationStatus(existing.data.status)) {
    return { status: "error", message: "That application could not be found.", fieldErrors: {} }
  }

  const decision = statusChangeDecision({
    from: existing.data.status,
    to: nextStatus,
  })
  if (!decision.ok) {
    return { status: "error", message: decision.message, fieldErrors: {} }
  }

  const { error } = await supabase
    .from("applications")
    .update({ status: nextStatus })
    .eq("user_id", user.id)
    .eq("id", id)

  if (error) {
    return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  }

  revalidatePath("/applications")
  revalidatePath(`/applications/${id}`)
  revalidatePath("/dashboard")
  return initialRecordFormState
}

export async function deleteApplication(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) redirect("/applications")

  const supabase = await createClient()
  const { error } = await supabase.from("applications").delete().eq("user_id", user.id).eq("id", id)
  assertDeleted(error)
  revalidatePath("/applications")
  revalidatePath("/companies")
  revalidatePath("/dashboard")
  redirect(safeRecordPath(formText(formData, "returnTo"), "/applications"))
}
