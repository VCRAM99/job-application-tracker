"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/session"
import { recommendedJobsEnabled } from "@/lib/jobs/flags"
import { isTimeZone } from "@/lib/jobs/query"
import { nextPostingFlags, type PostingCommand } from "@/lib/jobs/state"
import { type JobActionState } from "@/lib/jobs/action-state"
import { isMissingTable, recordErrorMessage } from "@/lib/records/logic"
import { formText, isUuid } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

function disabled(): JobActionState {
  return { status: "error", message: "Recommended jobs are turned off." }
}

function failure(error: { code?: string; message?: string } | null): JobActionState {
  if (isMissingTable(error)) {
    return { status: "error", message: "Recommended jobs are not available yet. Apply the latest migration, then reload." }
  }
  return { status: "error", message: recordErrorMessage(error) }
}

async function mutatePosting(postingId: string, command: PostingCommand): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()
  const existing = await supabase
    .from("posting_states")
    .select("saved, hidden, feedback")
    .eq("user_id", user.id)
    .eq("posting_id", postingId)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  const current = {
    saved: Boolean(existing.data?.saved),
    hidden: Boolean(existing.data?.hidden),
    feedback:
      existing.data?.feedback === "already_applied" || existing.data?.feedback === "not_interested"
        ? existing.data.feedback
        : null,
  }
  const next = nextPostingFlags(current, command)
  const saved = await supabase.from("posting_states").upsert(
    {
      user_id: user.id,
      posting_id: postingId,
      saved: next.saved,
      hidden: next.hidden,
      feedback: next.feedback,
    },
    { onConflict: "user_id,posting_id" },
  )
  if (saved.error) throw new Error(saved.error.message)
}

async function postingCommand(formData: FormData, command: PostingCommand): Promise<JobActionState> {
  if (!recommendedJobsEnabled()) return disabled()
  const postingId = formText(formData, "postingId")
  if (!isUuid(postingId)) return { status: "error", message: "That job could not be found." }
  try {
    await mutatePosting(postingId, command)
  } catch (error) {
    return failure({ message: error instanceof Error ? error.message : "" })
  }
  revalidatePath("/jobs")
  return { status: "success", message: null }
}

export async function saveJob(_previous: JobActionState, formData: FormData) {
  return postingCommand(formData, "save")
}
export async function unsaveJob(_previous: JobActionState, formData: FormData) {
  return postingCommand(formData, "unsave")
}
export async function hideJob(_previous: JobActionState, formData: FormData) {
  return postingCommand(formData, "hide")
}
export async function unhideJob(_previous: JobActionState, formData: FormData) {
  return postingCommand(formData, "unhide")
}
export async function markNotInterested(_previous: JobActionState, formData: FormData) {
  return postingCommand(formData, "not_interested")
}
export async function markAlreadyApplied(_previous: JobActionState, formData: FormData) {
  return postingCommand(formData, "already_applied")
}
export async function clearJobFeedback(_previous: JobActionState, formData: FormData) {
  return postingCommand(formData, "clear_feedback")
}

export async function setEmployerStance(_previous: JobActionState, formData: FormData): Promise<JobActionState> {
  if (!recommendedJobsEnabled()) return disabled()
  const user = await requireUser()
  const employerId = formText(formData, "employerId")
  const stance = formText(formData, "stance")
  if (!isUuid(employerId) || (stance !== "preferred" && stance !== "excluded" && stance !== "clear")) {
    return { status: "error", message: "That company could not be updated." }
  }
  const supabase = await createClient()
  const result =
    stance === "clear"
      ? await supabase.from("employer_preferences").delete().eq("user_id", user.id).eq("employer_id", employerId)
      : await supabase.from("employer_preferences").upsert(
          { user_id: user.id, employer_id: employerId, stance },
          { onConflict: "user_id,employer_id" },
        )
  if (result.error) return failure(result.error)
  revalidatePath("/jobs")
  return { status: "success", message: null }
}

function checked(formData: FormData, key: string): boolean {
  return formData.getAll(key).includes("on") || formData.get(key) === "1"
}

export async function saveJobPreferences(
  _previous: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  if (!recommendedJobsEnabled()) return disabled()
  const user = await requireUser()
  const timezone = formText(formData, "timezone") || "UTC"
  if (!isTimeZone(timezone)) return { status: "error", message: "Enter a valid timezone, such as America/Toronto." }
  const salary = formText(formData, "salary")
  if (salary && !/^\d+(\.\d{1,2})?$/.test(salary)) {
    return { status: "error", message: "Enter a salary minimum with up to two decimal places." }
  }
  const currency = (formText(formData, "currency") || "USD").toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return { status: "error", message: "Use a three-letter currency code." }
  const supabase = await createClient()
  const result = await supabase.from("job_preferences").upsert(
    {
      user_id: user.id,
      keywords: formText(formData, "q").slice(0, 120) || null,
      countries: formData.getAll("country").map(String).filter((value) => value === "CA" || value === "US"),
      locations: formText(formData, "location")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 12),
      work_arrangements: formData.getAll("arrangement").map(String),
      seniorities: formData.getAll("seniority").map(String),
      employment_types: formData.getAll("employment").map(String),
      salary_min: salary ? Number(salary) : null,
      salary_currency: currency,
      include_unknown_compensation: !checked(formData, "hideUnknownSalary"),
      posted_within_days: ["7", "30", "90"].includes(formText(formData, "posted"))
        ? Number(formText(formData, "posted"))
        : null,
      exclude_easy_apply: checked(formData, "easyApply"),
      timezone,
    },
    { onConflict: "user_id" },
  )
  if (result.error) return failure(result.error)
  revalidatePath("/jobs")
  return { status: "success", message: "Preferences saved." }
}

export async function saveSearch(_previous: JobActionState, formData: FormData): Promise<JobActionState> {
  if (!recommendedJobsEnabled()) return disabled()
  const user = await requireUser()
  const name = formText(formData, "name")
  if (name.length < 1 || name.length > 80) return { status: "error", message: "Name this search in 80 characters or fewer." }
  const supabase = await createClient()
  const result = await supabase.from("saved_searches").insert({
    user_id: user.id,
    name,
    filters: {
      keywords: formText(formData, "q"),
      countries: formData.getAll("country").map(String),
      locations: formText(formData, "location")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      workArrangements: formData.getAll("arrangement").map(String),
      seniorities: formData.getAll("seniority").map(String),
      employmentTypes: formData.getAll("employment").map(String),
      salaryMin: formText(formData, "salary") ? Number(formText(formData, "salary")) : null,
      salaryCurrency: (formText(formData, "currency") || "USD").toUpperCase(),
      includeUnknownCompensation: !checked(formData, "hideUnknownSalary"),
      postedWithinDays: ["7", "30", "90"].includes(formText(formData, "posted"))
        ? Number(formText(formData, "posted"))
        : null,
      excludeEasyApply: checked(formData, "easyApply"),
    },
  })
  if (result.error) return failure(result.error)
  revalidatePath("/jobs")
  revalidatePath("/jobs/alerts")
  return { status: "success", message: "Search saved." }
}

export async function saveAlertSubscription(
  _previous: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  if (!recommendedJobsEnabled()) return disabled()
  const user = await requireUser()
  const cadence = formText(formData, "cadence")
  const delivery = formText(formData, "delivery")
  const timezone = formText(formData, "timezone") || "UTC"
  const minimum = Number(formText(formData, "minimumMatch") || "40")
  const savedSearchId = formText(formData, "savedSearchId")
  if (cadence !== "off" && cadence !== "daily" && cadence !== "weekly") {
    return { status: "error", message: "Choose daily, weekly, or off." }
  }
  if (delivery !== "in_app" && delivery !== "email" && delivery !== "both") {
    return { status: "error", message: "Choose a delivery option." }
  }
  if (!isTimeZone(timezone) || !Number.isInteger(minimum) || minimum < 0 || minimum > 100) {
    return { status: "error", message: "Check the timezone and match minimum." }
  }
  if (savedSearchId && !isUuid(savedSearchId)) {
    return { status: "error", message: "Choose a saved search." }
  }
  const supabase = await createClient()
  const id = formText(formData, "id")
  const payload = {
    user_id: user.id,
    cadence,
    delivery,
    timezone,
    minimum_match: minimum,
    saved_search_id: savedSearchId || null,
    paused: checked(formData, "paused"),
  }
  const result = isUuid(id)
    ? await supabase.from("job_alert_subscriptions").update(payload).eq("user_id", user.id).eq("id", id)
    : await supabase.from("job_alert_subscriptions").insert(payload)
  if (result.error) return failure(result.error)
  revalidatePath("/jobs/alerts")
  return { status: "success", message: cadence === "off" ? "Alerts are off." : "Alert saved. Nothing is emailed until a sender is approved." }
}

export async function deleteAlertSubscription(formData: FormData): Promise<void> {
  if (!recommendedJobsEnabled()) return
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) return
  const supabase = await createClient()
  await supabase.from("job_alert_subscriptions").delete().eq("user_id", user.id).eq("id", id)
  revalidatePath("/jobs/alerts")
}

export async function markAlertRead(formData: FormData): Promise<void> {
  if (!recommendedJobsEnabled()) return
  const user = await requireUser()
  const id = formText(formData, "id")
  if (!isUuid(id)) return
  const supabase = await createClient()
  await supabase.from("job_alert_deliveries").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).eq("id", id)
  revalidatePath("/jobs/alerts")
}
