"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/auth/session"
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
import { recordErrorMessage, statusChangeDecision } from "@/lib/records/logic"
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
  revalidatePath(`/companies/${id}`)
  redirect(`/companies/${id}`)
}

export async function deleteCompany(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) redirect("/companies")

  const supabase = await createClient()
  await supabase.from("companies").delete().eq("user_id", user.id).eq("id", id)
  revalidatePath("/companies")
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

  const company = await resolveCompanyId(user.id, parsed.data)
  if ("status" in company) return company

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("applications")
    .insert(applicationPayload(user.id, company.companyId, parsed.data))
    .select("id")
    .single()

  if (error || !data) {
    if (company.created) {
      await supabase.from("companies").delete().eq("user_id", user.id).eq("id", company.companyId)
    }
    return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  }

  revalidatePath("/applications")
  revalidatePath("/companies")
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
    appliedAt: parsed.data.appliedAt,
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
    .select("status, applied_at")
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
    appliedAt: existing.data.applied_at,
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
  return initialRecordFormState
}

export async function deleteApplication(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) redirect("/applications")

  const supabase = await createClient()
  await supabase.from("applications").delete().eq("user_id", user.id).eq("id", id)
  revalidatePath("/applications")
  revalidatePath("/companies")
  redirect(safeRecordPath(formText(formData, "returnTo"), "/applications"))
}
