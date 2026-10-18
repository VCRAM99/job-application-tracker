import "server-only"

import { notFound } from "next/navigation"

import { requireUser } from "@/lib/auth/session"
import {
  isApplicationStatus,
  isCompanySize,
  isEmploymentType,
  isPriorityTier,
  isResearchStatus,
  isWorkArrangement,
  type ApplicationStatus,
  type CompanySize,
  type EmploymentType,
  type PriorityTier,
  type ResearchStatus,
  type WorkArrangement,
} from "@/lib/records/constants"
import { isUuid } from "@/lib/records/form-state"
import { countByCompany, isMissingTable, withCompanyNames } from "@/lib/records/logic"
import type { ApplicationRecord, CompanyRecord } from "@/lib/records/query"
import { createClient } from "@/lib/supabase/server"

export type DataResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: "missing_table" | "unavailable" }

type CompanyRow = {
  id: string
  user_id: string
  name: string
  size: string
  location: string | null
  industry: string | null
  research_status: string
  priority_tier: string
  reference: string | null
  website_url: string | null
  notes: string | null
  follow_up_date: string | null
  created_at: string
  updated_at: string
}

type ApplicationRow = {
  id: string
  user_id: string
  company_id: string
  job_title: string
  job_url: string | null
  source: string | null
  location: string | null
  work_arrangement: string
  employment_type: string
  salary_min: number | string | null
  salary_max: number | string | null
  salary_currency: string
  status: string
  applied_at: string | null
  next_follow_up_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function asNumber(value: number | string | null): number | null {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapCompany(row: CompanyRow, applicationCount: number): CompanyRecord | null {
  if (
    !isCompanySize(row.size) ||
    !isResearchStatus(row.research_status) ||
    !isPriorityTier(row.priority_tier)
  ) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    size: row.size,
    location: row.location,
    industry: row.industry,
    researchStatus: row.research_status,
    priorityTier: row.priority_tier,
    reference: row.reference,
    websiteUrl: row.website_url,
    notes: row.notes,
    followUpDate: row.follow_up_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    applicationCount,
  }
}

function mapApplication(row: ApplicationRow): Omit<ApplicationRecord, "companyName"> | null {
  if (
    !isApplicationStatus(row.status) ||
    !isWorkArrangement(row.work_arrangement) ||
    !isEmploymentType(row.employment_type)
  ) {
    return null
  }

  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    jobTitle: row.job_title,
    jobUrl: row.job_url,
    source: row.source,
    location: row.location,
    workArrangement: row.work_arrangement,
    employmentType: row.employment_type,
    salaryMin: asNumber(row.salary_min),
    salaryMax: asNumber(row.salary_max),
    salaryCurrency: row.salary_currency,
    status: row.status,
    appliedAt: row.applied_at,
    nextFollowUpDate: row.next_follow_up_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function failure(error: { code?: string; message?: string } | null): DataResult<never> {
  return { ok: false, error: isMissingTable(error) ? "missing_table" : "unavailable" }
}

export async function listCompanies(): Promise<DataResult<CompanyRecord[]>> {
  const user = await requireUser()
  const supabase = await createClient()
  const [companiesResult, applicationsResult] = await Promise.all([
    supabase.from("companies").select("*").eq("user_id", user.id),
    supabase.from("applications").select("company_id").eq("user_id", user.id),
  ])

  if (companiesResult.error) return failure(companiesResult.error)
  if (applicationsResult.error) return failure(applicationsResult.error)

  const counts = countByCompany(
    ((applicationsResult.data ?? []) as Array<{ company_id: string }>).map(
      (row) => row.company_id,
    ),
  )

  return {
    ok: true,
    data: ((companiesResult.data ?? []) as CompanyRow[])
      .map((row) => mapCompany(row, counts.get(row.id) ?? 0))
      .filter((row): row is CompanyRecord => row !== null),
  }
}

export async function getCompany(id: string): Promise<DataResult<CompanyRecord | null>> {
  if (!isUuid(id)) notFound()
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle()

  if (error) return failure(error)
  if (!data) return { ok: true, data: null }

  const applications = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", id)

  if (applications.error) return failure(applications.error)
  const company = mapCompany(data as CompanyRow, applications.data?.length ?? 0)
  return { ok: true, data: company }
}

export async function listApplications(): Promise<DataResult<ApplicationRecord[]>> {
  const user = await requireUser()
  const supabase = await createClient()
  const [applicationsResult, companiesResult] = await Promise.all([
    supabase.from("applications").select("*").eq("user_id", user.id),
    supabase.from("companies").select("id, name").eq("user_id", user.id),
  ])

  if (applicationsResult.error) return failure(applicationsResult.error)
  if (companiesResult.error) return failure(companiesResult.error)

  const mapped = ((applicationsResult.data ?? []) as ApplicationRow[])
    .map(mapApplication)
    .filter((row): row is Omit<ApplicationRecord, "companyName"> => row !== null)

  return {
    ok: true,
    data: withCompanyNames(
      mapped,
      (companiesResult.data ?? []) as Array<{ id: string; name: string }>,
    ),
  }
}

export async function getApplication(id: string): Promise<DataResult<ApplicationRecord | null>> {
  if (!isUuid(id)) notFound()
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle()

  if (error) return failure(error)
  if (!data) return { ok: true, data: null }

  const mapped = mapApplication(data as ApplicationRow)
  if (!mapped) return { ok: true, data: null }

  const company = await supabase
    .from("companies")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("id", mapped.companyId)
    .maybeSingle()

  if (company.error) return failure(company.error)

  return {
    ok: true,
    data: withCompanyNames(mapped ? [mapped] : [], company.data ? [company.data] : [])[0] ?? null,
  }
}

export async function listCompanyOptions(): Promise<
  DataResult<Array<{ id: string; name: string }>>
> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true })

  if (error) return failure(error)
  return { ok: true, data: (data ?? []) as Array<{ id: string; name: string }> }
}

export type { ApplicationStatus, CompanySize, EmploymentType, PriorityTier, ResearchStatus, WorkArrangement }
