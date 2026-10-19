"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/auth/session"
import { isUuid, formText, type RecordFormState } from "@/lib/records/form-state"
import { assertDeleted, completedAtForStatus, recordErrorMessage, referenceDecision, todayDate } from "@/lib/records/logic"
import {
  contactFormSchema,
  fieldErrorsFrom,
  preparationFormSchema,
  taskFormSchema,
  type ContactFormValues,
  type PreparationFormValues,
  type TaskFormValues,
} from "@/lib/records/schemas"
import { createClient } from "@/lib/supabase/server"

function refresh() {
  revalidatePath("/networking")
  revalidatePath("/tasks")
  revalidatePath("/preparation")
  revalidatePath("/dashboard")
}

async function resolveLinks(
  userId: string,
  companyId: string | null,
  applicationId: string | null,
): Promise<
  | { ok: true; companyId: string | null; applicationId: string | null }
  | RecordFormState
> {
  const supabase = await createClient()
  const company = companyId
    ? await supabase.from("companies").select("id").eq("user_id", userId).eq("id", companyId).maybeSingle()
    : { data: null, error: null }
  const application = applicationId
    ? await supabase
        .from("applications")
        .select("id, company_id")
        .eq("user_id", userId)
        .eq("id", applicationId)
        .maybeSingle()
    : { data: null, error: null }

  if (company.error) return { status: "error", message: recordErrorMessage(company.error), fieldErrors: {} }
  if (application.error) {
    return { status: "error", message: recordErrorMessage(application.error), fieldErrors: {} }
  }

  const decision = referenceDecision({
    companyId,
    applicationId,
    companyOwned: !companyId || Boolean(company.data),
    applicationCompanyId: application.data?.company_id ?? null,
  })
  if (!decision.ok) {
    return { status: "error", message: null, fieldErrors: { [decision.field]: decision.message } }
  }
  return decision
}

function contactPayload(userId: string, values: ContactFormValues, links: { companyId: string | null; applicationId: string | null }) {
  return {
    user_id: userId,
    name: values.name,
    role_title: values.roleTitle,
    organization: values.organization,
    email: values.email,
    linkedin_url: values.linkedinUrl,
    company_id: links.companyId,
    application_id: links.applicationId,
    relationship_type: values.relationshipType,
    outreach_status: values.outreachStatus,
    last_contacted_at: values.lastContactedAt,
    next_follow_up_date: values.nextFollowUpDate,
    notes: values.notes,
  }
}

function taskPayload(
  userId: string,
  values: TaskFormValues,
  links: { companyId: string | null; applicationId: string | null },
  completedAt: string | null,
) {
  return {
    user_id: userId,
    title: values.title,
    description: values.description,
    status: values.status,
    priority: values.priority,
    due_date: values.dueDate,
    company_id: links.companyId,
    application_id: links.applicationId,
    completed_at: completedAt,
  }
}

function preparationPayload(userId: string, values: PreparationFormValues, completedAt: string | null) {
  return {
    user_id: userId,
    title: values.title,
    category: values.category,
    status: values.status,
    target_date: values.targetDate,
    completed_at: completedAt,
    resource_url: values.resourceUrl,
    notes: values.notes,
  }
}

function parseContact(formData: FormData) {
  return contactFormSchema.safeParse({
    name: formText(formData, "name"),
    roleTitle: formText(formData, "roleTitle"),
    organization: formText(formData, "organization"),
    email: formText(formData, "email"),
    linkedinUrl: formText(formData, "linkedinUrl"),
    companyId: formText(formData, "companyId"),
    applicationId: formText(formData, "applicationId"),
    relationshipType: formText(formData, "relationshipType"),
    outreachStatus: formText(formData, "outreachStatus"),
    lastContactedAt: formText(formData, "lastContactedAt"),
    nextFollowUpDate: formText(formData, "nextFollowUpDate"),
    notes: formText(formData, "notes"),
  })
}

function parseTask(formData: FormData) {
  return taskFormSchema.safeParse({
    title: formText(formData, "title"),
    description: formText(formData, "description"),
    status: formText(formData, "status"),
    priority: formText(formData, "priority"),
    dueDate: formText(formData, "dueDate"),
    companyId: formText(formData, "companyId"),
    applicationId: formText(formData, "applicationId"),
  })
}

function parsePreparation(formData: FormData) {
  return preparationFormSchema.safeParse({
    title: formText(formData, "title"),
    category: formText(formData, "category"),
    status: formText(formData, "status"),
    targetDate: formText(formData, "targetDate"),
    resourceUrl: formText(formData, "resourceUrl"),
    notes: formText(formData, "notes"),
  })
}

export async function createContact(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const parsed = parseContact(formData)
  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again.", fieldErrors: fieldErrorsFrom(parsed.error) }
  }
  const links = await resolveLinks(user.id, parsed.data.companyId, parsed.data.applicationId)
  if ("status" in links) return links
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("contacts")
    .insert(contactPayload(user.id, parsed.data, links))
    .select("id")
    .single()
  if (error || !data) return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  refresh()
  redirect(`/networking/${data.id}`)
}

export async function updateContact(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) return { status: "error", message: "That contact could not be found.", fieldErrors: {} }
  const parsed = parseContact(formData)
  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again.", fieldErrors: fieldErrorsFrom(parsed.error) }
  }
  const links = await resolveLinks(user.id, parsed.data.companyId, parsed.data.applicationId)
  if ("status" in links) return links
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("contacts")
    .update(contactPayload(user.id, parsed.data, links))
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  if (!data) return { status: "error", message: "That contact could not be found.", fieldErrors: {} }
  refresh()
  revalidatePath(`/networking/${id}`)
  redirect(`/networking/${id}`)
}

export async function deleteContact(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (isUuid(id)) {
    const supabase = await createClient()
    const { error } = await supabase.from("contacts").delete().eq("user_id", user.id).eq("id", id)
    assertDeleted(error)
  }
  refresh()
  redirect("/networking")
}

export async function createTask(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const parsed = parseTask(formData)
  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again.", fieldErrors: fieldErrorsFrom(parsed.error) }
  }
  const links = await resolveLinks(user.id, parsed.data.companyId, parsed.data.applicationId)
  if ("status" in links) return links
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("tasks")
    .insert(taskPayload(user.id, parsed.data, links, completedAtForStatus(parsed.data.status, todayDate())))
    .select("id")
    .single()
  if (error || !data) return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  refresh()
  redirect(`/tasks/${data.id}`)
}

export async function updateTask(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) return { status: "error", message: "That task could not be found.", fieldErrors: {} }
  const parsed = parseTask(formData)
  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again.", fieldErrors: fieldErrorsFrom(parsed.error) }
  }
  const links = await resolveLinks(user.id, parsed.data.companyId, parsed.data.applicationId)
  if ("status" in links) return links
  const supabase = await createClient()
  const existing = await supabase
    .from("tasks")
    .select("status, completed_at")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle()
  if (existing.error) return { status: "error", message: recordErrorMessage(existing.error), fieldErrors: {} }
  if (!existing.data) return { status: "error", message: "That task could not be found.", fieldErrors: {} }
  const completedAt =
    parsed.data.status === "done"
      ? existing.data.status === "done" && existing.data.completed_at
        ? existing.data.completed_at
        : todayDate()
      : null
  const { data, error } = await supabase
    .from("tasks")
    .update(taskPayload(user.id, parsed.data, links, completedAt))
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  if (!data) return { status: "error", message: "That task could not be found.", fieldErrors: {} }
  refresh()
  revalidatePath(`/tasks/${id}`)
  redirect(`/tasks/${id}`)
}

export async function setTaskCompletion(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) return
  const completed = formText(formData, "completed") === "true"
  const supabase = await createClient()
  await supabase
    .from("tasks")
    .update({
      status: completed ? "done" : "todo",
      completed_at: completed ? todayDate() : null,
    })
    .eq("user_id", user.id)
    .eq("id", id)
  refresh()
  revalidatePath(`/tasks/${id}`)
}

export async function deleteTask(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (isUuid(id)) {
    const supabase = await createClient()
    const { error } = await supabase.from("tasks").delete().eq("user_id", user.id).eq("id", id)
    assertDeleted(error)
  }
  refresh()
  redirect("/tasks")
}

export async function createPreparation(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const parsed = parsePreparation(formData)
  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again.", fieldErrors: fieldErrorsFrom(parsed.error) }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("preparation_items")
    .insert(
      preparationPayload(user.id, parsed.data, completedAtForStatus(parsed.data.status, todayDate())),
    )
    .select("id")
    .single()
  if (error || !data) return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  refresh()
  redirect(`/preparation/${data.id}`)
}

export async function updatePreparation(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) return { status: "error", message: "That preparation item could not be found.", fieldErrors: {} }
  const parsed = parsePreparation(formData)
  if (!parsed.success) {
    return { status: "error", message: "Check the form and try again.", fieldErrors: fieldErrorsFrom(parsed.error) }
  }
  const supabase = await createClient()
  const existing = await supabase
    .from("preparation_items")
    .select("status, completed_at")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle()
  if (existing.error) return { status: "error", message: recordErrorMessage(existing.error), fieldErrors: {} }
  if (!existing.data) {
    return { status: "error", message: "That preparation item could not be found.", fieldErrors: {} }
  }
  const completedAt =
    parsed.data.status === "completed"
      ? existing.data.status === "completed" && existing.data.completed_at
        ? existing.data.completed_at
        : todayDate()
      : null
  const { data, error } = await supabase
    .from("preparation_items")
    .update(preparationPayload(user.id, parsed.data, completedAt))
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) return { status: "error", message: recordErrorMessage(error), fieldErrors: {} }
  if (!data) return { status: "error", message: "That preparation item could not be found.", fieldErrors: {} }
  refresh()
  revalidatePath(`/preparation/${id}`)
  redirect(`/preparation/${id}`)
}

export async function deletePreparation(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = formText(formData, "id")
  if (isUuid(id)) {
    const supabase = await createClient()
    const { error } = await supabase.from("preparation_items").delete().eq("user_id", user.id).eq("id", id)
    assertDeleted(error)
  }
  refresh()
  redirect("/preparation")
}
