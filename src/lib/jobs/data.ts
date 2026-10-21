import "server-only"

import { requireUser } from "@/lib/auth/session"
import { recommendedJobsEnabled } from "@/lib/jobs/flags"
import { jobsErrorKind, searchPayload, type JobSearchState } from "@/lib/jobs/query"
import { scorePosting, type MatchSignals } from "@/lib/jobs/score"
import { textTokens } from "@/lib/jobs/text"
import { createClient } from "@/lib/supabase/server"

export type JobsResult<T> = { ok: true; data: T } | { ok: false; error: "missing_table" | "unavailable" | "disabled" }

export type JobListing = {
  id: string
  title: string
  employerId: string | null
  employerName: string | null
  locationText: string | null
  countryCode: string | null
  region: string | null
  workArrangement: string
  employmentType: string
  seniority: string
  compensationMin: number | null
  compensationMax: number | null
  currency: string | null
  salaryPeriod: string
  postedAt: string | null
  discoveredAt: string | null
  lastVerifiedAt: string | null
  listingUrl: string
  applicationUrl: string | null
  applicationMethod: string
  listingStatus: string
  requisitionId: string | null
  skills: string[]
  sourceProvider: string
  sourceName: string
  matchScore: number
  saved: boolean
  hidden: boolean
  feedback: string | null
  totalCount: number
  reasons: Array<{ code: string; points: number; text: string }>
  reasonsMatchScore: boolean
}

type SearchRow = {
  id: string
  title: string
  employer_id: string | null
  employer_name: string | null
  location_text: string | null
  country_code: string | null
  region: string | null
  work_arrangement: string
  employment_type: string
  seniority: string
  compensation_min: number | string | null
  compensation_max: number | string | null
  currency: string | null
  salary_period: string
  posted_at: string | null
  discovered_at: string | null
  last_verified_at: string | null
  listing_url: string
  application_url: string | null
  application_method: string
  listing_status: string
  requisition_id: string | null
  skills: string[] | null
  source_provider: string
  source_name: string
  match_score: number
  saved: boolean
  hidden: boolean
  feedback: string | null
  total_count: number
}

function money(value: number | string | null): number | null {
  if (value == null || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

async function loadSignals(userId: string, seniorities: string[]): Promise<MatchSignals> {
  const supabase = await createClient()
  const [skills, roles, jobs] = await Promise.all([
    supabase.from("skill_entries").select("name").eq("user_id", userId).eq("verification_state", "user_verified"),
    supabase.from("career_profiles").select("target_roles").eq("user_id", userId).maybeSingle(),
    supabase.from("employment_entries").select("title").eq("user_id", userId).eq("verification_state", "user_verified"),
  ])
  const skillNames =
    skills.error || !Array.isArray(skills.data) ? [] : skills.data.map((row) => String(row.name ?? ""))
  const titles = jobs.error || !Array.isArray(jobs.data) ? [] : jobs.data.map((row) => String(row.title ?? ""))
  const targetRoles =
    roles.error || !roles.data?.target_roles
      ? []
      : (roles.data.target_roles as string[])
  return {
    skillTokens: textTokens(skillNames.join(" ")),
    roleTokens: textTokens(targetRoles.join(" ")),
    experienceTokens: textTokens(titles.join(" ")),
    seniorities,
  }
}

async function preferredEmployers(userId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const result = await supabase
    .from("employer_preferences")
    .select("employer_id")
    .eq("user_id", userId)
    .eq("stance", "preferred")
  if (result.error || !result.data) return new Set()
  return new Set(result.data.map((row) => String(row.employer_id)))
}

export async function searchJobs(state: JobSearchState): Promise<JobsResult<{ listings: JobListing[]; total: number }>> {
  if (!recommendedJobsEnabled()) return { ok: false, error: "disabled" }
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase.rpc("search_recommended_jobs", { p_query: searchPayload(state) })
  if (result.error) return { ok: false, error: jobsErrorKind(result.error) }
  const rows = (result.data ?? []) as SearchRow[]
  const [signals, preferred] = await Promise.all([
    loadSignals(user.id, state.seniorities),
    preferredEmployers(user.id),
  ])
  const now = new Date()
  const listings = rows.map((row) => {
    const skills = row.skills ?? []
    const referenceAt = row.last_verified_at ?? row.posted_at
    const estimate = scorePosting(
      signals,
      {
        titleTokens: textTokens(row.title),
        skillTokens: textTokens(skills.join(" ")),
        seniority: row.seniority,
        preferred: row.employer_id ? preferred.has(row.employer_id) : false,
        referenceAt,
      },
      now,
    )
    return {
      id: row.id,
      title: row.title,
      employerId: row.employer_id,
      employerName: row.employer_name,
      locationText: row.location_text,
      countryCode: row.country_code,
      region: row.region,
      workArrangement: row.work_arrangement,
      employmentType: row.employment_type,
      seniority: row.seniority,
      compensationMin: money(row.compensation_min),
      compensationMax: money(row.compensation_max),
      currency: row.currency,
      salaryPeriod: row.salary_period,
      postedAt: row.posted_at,
      discoveredAt: row.discovered_at,
      lastVerifiedAt: row.last_verified_at,
      listingUrl: row.listing_url,
      applicationUrl: row.application_url,
      applicationMethod: row.application_method,
      listingStatus: row.listing_status,
      requisitionId: row.requisition_id,
      skills,
      sourceProvider: row.source_provider,
      sourceName: row.source_name,
      matchScore: Number(row.match_score) || 0,
      saved: row.saved,
      hidden: row.hidden,
      feedback: row.feedback,
      totalCount: Number(row.total_count) || 0,
      reasons: estimate.reasons,
      reasonsMatchScore: estimate.score === Number(row.match_score),
    }
  })
  return { ok: true, data: { listings, total: listings[0]?.totalCount ?? 0 } }
}

export type StoredJobPreferences = {
  keywords: string | null
  countries: string[]
  locations: string[]
  workArrangements: string[]
  seniorities: string[]
  employmentTypes: string[]
  salaryMin: number | null
  salaryCurrency: string
  includeUnknownCompensation: boolean
  postedWithinDays: number | null
  excludeEasyApply: boolean
  timezone: string
}

export async function loadJobPreferences(): Promise<JobsResult<StoredJobPreferences | null>> {
  if (!recommendedJobsEnabled()) return { ok: false, error: "disabled" }
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase.from("job_preferences").select("*").eq("user_id", user.id).maybeSingle()
  if (result.error) return { ok: false, error: jobsErrorKind(result.error) }
  if (!result.data) return { ok: true, data: null }
  const row = result.data as {
    keywords: string | null
    countries: string[] | null
    locations: string[] | null
    work_arrangements: string[] | null
    seniorities: string[] | null
    employment_types: string[] | null
    salary_min: number | string | null
    salary_currency: string
    include_unknown_compensation: boolean
    posted_within_days: number | null
    exclude_easy_apply: boolean
    timezone: string
  }
  return {
    ok: true,
    data: {
      keywords: row.keywords,
      countries: row.countries ?? [],
      locations: row.locations ?? [],
      workArrangements: row.work_arrangements ?? [],
      seniorities: row.seniorities ?? [],
      employmentTypes: row.employment_types ?? [],
      salaryMin: money(row.salary_min),
      salaryCurrency: row.salary_currency,
      includeUnknownCompensation: row.include_unknown_compensation,
      postedWithinDays: row.posted_within_days,
      excludeEasyApply: row.exclude_easy_apply,
      timezone: row.timezone,
    },
  }
}

export type TrackerPosting = {
  id: string
  title: string
  employerName: string | null
  locationText: string | null
  workArrangement: string
  employmentType: string
  compensationMin: number | null
  compensationMax: number | null
  currency: string | null
  salaryPeriod: string
  listingUrl: string
  applicationUrl: string | null
  requisitionId: string | null
  sourceName: string
}

export async function loadTrackerPosting(id: string): Promise<JobsResult<TrackerPosting | null>> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("job_postings")
    .select(
      "id, title, location_text, work_arrangement, employment_type, compensation_min, compensation_max, currency, salary_period, listing_url, application_url, requisition_id, employer_id, source_id",
    )
    .eq("id", id)
    .maybeSingle()
  if (result.error) return { ok: false, error: jobsErrorKind(result.error) }
  if (!result.data) return { ok: true, data: null }
  const row = result.data as {
    id: string
    title: string
    location_text: string | null
    work_arrangement: string
    employment_type: string
    compensation_min: number | string | null
    compensation_max: number | string | null
    currency: string | null
    salary_period: string
    listing_url: string
    application_url: string | null
    requisition_id: string | null
    employer_id: string | null
    source_id: string
  }
  const [employer, source, linked] = await Promise.all([
    row.employer_id
      ? supabase.from("catalog_employers").select("canonical_name").eq("id", row.employer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("job_sources").select("display_name").eq("id", row.source_id).maybeSingle(),
    supabase
      .from("application_postings")
      .select("application_id")
      .eq("user_id", user.id)
      .eq("posting_id", id)
      .maybeSingle(),
  ])
  if (linked.data?.application_id) {
    return {
      ok: true,
      data: {
        id: row.id,
        title: row.title,
        employerName: (employer.data as { canonical_name?: string } | null)?.canonical_name ?? null,
        locationText: row.location_text,
        workArrangement: row.work_arrangement,
        employmentType: row.employment_type,
        compensationMin: money(row.compensation_min),
        compensationMax: money(row.compensation_max),
        currency: row.currency,
        salaryPeriod: row.salary_period,
        listingUrl: row.listing_url,
        applicationUrl: row.application_url,
        requisitionId: row.requisition_id,
        sourceName: (source.data as { display_name?: string } | null)?.display_name ?? "Job board",
      },
    }
  }
  return {
    ok: true,
    data: {
      id: row.id,
      title: row.title,
      employerName: (employer.data as { canonical_name?: string } | null)?.canonical_name ?? null,
      locationText: row.location_text,
      workArrangement: row.work_arrangement,
      employmentType: row.employment_type,
      compensationMin: money(row.compensation_min),
      compensationMax: money(row.compensation_max),
      currency: row.currency,
      salaryPeriod: row.salary_period,
      listingUrl: row.listing_url,
      applicationUrl: row.application_url,
      requisitionId: row.requisition_id,
      sourceName: (source.data as { display_name?: string } | null)?.display_name ?? "Job board",
    },
  }
}

export async function linkedApplicationId(postingId: string): Promise<string | null> {
  const user = await requireUser()
  const supabase = await createClient()
  const result = await supabase
    .from("application_postings")
    .select("application_id")
    .eq("user_id", user.id)
    .eq("posting_id", postingId)
    .maybeSingle()
  if (result.error || !result.data) return null
  return String(result.data.application_id)
}

export type AlertSubscriptionView = {
  id: string
  cadence: string
  minimumMatch: number
  delivery: string
  timezone: string
  paused: boolean
  lastSuccessfulRunAt: string | null
  lastError: string | null
  savedSearchId: string | null
}

export type AlertDeliveryView = {
  id: string
  postingId: string
  windowKey: string
  channel: string
  status: string
  error: string | null
  readAt: string | null
  createdAt: string
}

export async function loadAlertDesk(): Promise<
  JobsResult<{ subscriptions: AlertSubscriptionView[]; deliveries: AlertDeliveryView[]; searches: Array<{ id: string; name: string }> }>
> {
  if (!recommendedJobsEnabled()) return { ok: false, error: "disabled" }
  const user = await requireUser()
  const supabase = await createClient()
  const [subscriptions, deliveries, searches] = await Promise.all([
    supabase
      .from("job_alert_subscriptions")
      .select("id, cadence, minimum_match, delivery, timezone, paused, last_successful_run_at, last_error, saved_search_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_alert_deliveries")
      .select("id, posting_id, window_key, channel, status, error, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("saved_searches").select("id, name").eq("user_id", user.id).order("created_at", { ascending: false }),
  ])
  const error = subscriptions.error ?? deliveries.error ?? searches.error
  if (error) return { ok: false, error: jobsErrorKind(error) }
  return {
    ok: true,
    data: {
      subscriptions: (subscriptions.data ?? []).map((row) => ({
        id: String(row.id),
        cadence: String(row.cadence),
        minimumMatch: Number(row.minimum_match),
        delivery: String(row.delivery),
        timezone: String(row.timezone),
        paused: Boolean(row.paused),
        lastSuccessfulRunAt: row.last_successful_run_at ? String(row.last_successful_run_at) : null,
        lastError: row.last_error ? String(row.last_error) : null,
        savedSearchId: row.saved_search_id ? String(row.saved_search_id) : null,
      })),
      deliveries: (deliveries.data ?? []).map((row) => ({
        id: String(row.id),
        postingId: String(row.posting_id),
        windowKey: String(row.window_key),
        channel: String(row.channel),
        status: String(row.status),
        error: row.error ? String(row.error) : null,
        readAt: row.read_at ? String(row.read_at) : null,
        createdAt: String(row.created_at),
      })),
      searches: (searches.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })),
    },
  }
}
