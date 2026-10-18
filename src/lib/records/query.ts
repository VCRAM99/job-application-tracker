import {
  COMPANY_SIZES,
  PRIORITY_RANK,
  PRIORITY_TIERS,
  RESEARCH_STATUSES,
  isApplicationStatus,
  isCompanySize,
  isPriorityTier,
  isResearchStatus,
  statusRank,
  type ApplicationStatus,
  type CompanySize,
  type PriorityTier,
  type ResearchStatus,
} from "@/lib/records/constants"

export type CompanyRecord = {
  id: string
  userId: string
  name: string
  size: CompanySize
  location: string | null
  industry: string | null
  researchStatus: ResearchStatus
  priorityTier: PriorityTier
  reference: string | null
  websiteUrl: string | null
  notes: string | null
  followUpDate: string | null
  createdAt: string
  updatedAt: string
  applicationCount: number
}

export type ApplicationRecord = {
  id: string
  userId: string
  companyId: string
  companyName: string
  jobTitle: string
  jobUrl: string | null
  source: string | null
  location: string | null
  workArrangement: string
  employmentType: string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  status: ApplicationStatus
  appliedAt: string | null
  nextFollowUpDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type CompanyListQuery = {
  q: string
  size: CompanySize | "all"
  researchStatus: ResearchStatus | "all"
  priority: PriorityTier | "all"
  sort: "name" | "priority" | "followUp" | "updated" | "applications"
  dir: "asc" | "desc"
}

export type ApplicationListQuery = {
  q: string
  status: ApplicationStatus | "all"
  companyId: string
  source: string
  sort: "title" | "company" | "status" | "applied" | "followUp" | "updated"
  dir: "asc" | "desc"
}

export const defaultCompanyListQuery: CompanyListQuery = {
  q: "",
  size: "all",
  researchStatus: "all",
  priority: "all",
  sort: "name",
  dir: "asc",
}

export const defaultApplicationListQuery: ApplicationListQuery = {
  q: "",
  status: "all",
  companyId: "all",
  source: "all",
  sort: "updated",
  dir: "desc",
}

function first(params: URLSearchParams, key: string): string {
  return params.get(key)?.trim() ?? ""
}

export function parseCompanyListQuery(params: URLSearchParams): CompanyListQuery {
  const size = first(params, "size")
  const researchStatus = first(params, "researchStatus")
  const priority = first(params, "priority")
  const sort = first(params, "sort")
  const dir = first(params, "dir")

  return {
    q: first(params, "q"),
    size: isCompanySize(size) ? size : "all",
    researchStatus: isResearchStatus(researchStatus) ? researchStatus : "all",
    priority: isPriorityTier(priority) ? priority : "all",
    sort:
      sort === "priority" ||
      sort === "followUp" ||
      sort === "updated" ||
      sort === "applications" ||
      sort === "name"
        ? sort
        : "name",
    dir: dir === "desc" ? "desc" : "asc",
  }
}

export function parseApplicationListQuery(params: URLSearchParams): ApplicationListQuery {
  const status = first(params, "status")
  const sort = first(params, "sort")
  const dir = first(params, "dir")
  const companyId = first(params, "companyId")

  return {
    q: first(params, "q"),
    status: isApplicationStatus(status) ? status : "all",
    companyId: companyId.length > 0 ? companyId : "all",
    source: first(params, "source") || "all",
    sort:
      sort === "title" ||
      sort === "company" ||
      sort === "status" ||
      sort === "applied" ||
      sort === "followUp" ||
      sort === "updated"
        ? sort
        : "updated",
    dir: dir === "asc" ? "asc" : "desc",
  }
}

function includesQuery(query: string, values: Array<string | null>): boolean {
  if (!query) return true
  const needle = query.toLowerCase()
  return values.some((value) => (value ?? "").toLowerCase().includes(needle))
}

function compareText(left: string, right: string, dir: "asc" | "desc"): number {
  const result = left.localeCompare(right, undefined, { sensitivity: "base" })
  return dir === "asc" ? result : -result
}

function compareDate(left: string | null, right: string | null, dir: "asc" | "desc"): number {
  if (left === right) return 0
  if (!left) return 1
  if (!right) return -1
  const result = left < right ? -1 : 1
  return dir === "asc" ? result : -result
}

export function filterCompanies(
  companies: CompanyRecord[],
  query: CompanyListQuery,
): CompanyRecord[] {
  return companies.filter((company) => {
    if (query.size !== "all" && company.size !== query.size) return false
    if (query.researchStatus !== "all" && company.researchStatus !== query.researchStatus) {
      return false
    }
    if (query.priority !== "all" && company.priorityTier !== query.priority) return false
    return includesQuery(query.q, [
      company.name,
      company.industry,
      company.location,
      company.reference,
      company.notes,
    ])
  })
}

export function sortCompanies(
  companies: CompanyRecord[],
  query: CompanyListQuery,
): CompanyRecord[] {
  const sorted = [...companies]
  sorted.sort((left, right) => {
    let result = 0
    if (query.sort === "priority") {
      result = PRIORITY_RANK[left.priorityTier] - PRIORITY_RANK[right.priorityTier]
      if (query.dir === "desc") result = -result
    } else if (query.sort === "followUp") {
      result = compareDate(left.followUpDate, right.followUpDate, query.dir)
    } else if (query.sort === "updated") {
      result = compareDate(left.updatedAt, right.updatedAt, query.dir)
    } else if (query.sort === "applications") {
      result = left.applicationCount - right.applicationCount
      if (query.dir === "desc") result = -result
    } else {
      result = compareText(left.name, right.name, query.dir)
    }
    return result || compareText(left.name, right.name, "asc")
  })
  return sorted
}

export function filterApplications(
  applications: ApplicationRecord[],
  query: ApplicationListQuery,
): ApplicationRecord[] {
  return applications.filter((application) => {
    if (query.status !== "all" && application.status !== query.status) return false
    if (query.companyId !== "all" && application.companyId !== query.companyId) return false
    if (query.source !== "all" && (application.source ?? "") !== query.source) return false
    return includesQuery(query.q, [
      application.jobTitle,
      application.companyName,
      application.source,
      application.location,
      application.notes,
    ])
  })
}

export function sortApplications(
  applications: ApplicationRecord[],
  query: ApplicationListQuery,
): ApplicationRecord[] {
  const sorted = [...applications]
  sorted.sort((left, right) => {
    let result = 0
    if (query.sort === "title") {
      result = compareText(left.jobTitle, right.jobTitle, query.dir)
    } else if (query.sort === "company") {
      result = compareText(left.companyName, right.companyName, query.dir)
    } else if (query.sort === "status") {
      result = statusRank(left.status) - statusRank(right.status)
      if (query.dir === "desc") result = -result
    } else if (query.sort === "applied") {
      result = compareDate(left.appliedAt, right.appliedAt, query.dir)
    } else if (query.sort === "followUp") {
      result = compareDate(left.nextFollowUpDate, right.nextFollowUpDate, query.dir)
    } else {
      result = compareDate(left.updatedAt, right.updatedAt, query.dir)
    }
    return result || compareText(left.jobTitle, right.jobTitle, "asc")
  })
  return sorted
}

export function listHref(
  pathname: string,
  current: Record<string, string>,
  patch: Record<string, string | null>,
): string {
  const params = new URLSearchParams()
  const next = { ...current, ...patch }
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function companyQueryRecord(query: CompanyListQuery): Record<string, string> {
  return {
    q: query.q,
    size: query.size === "all" ? "" : query.size,
    researchStatus: query.researchStatus === "all" ? "" : query.researchStatus,
    priority: query.priority === "all" ? "" : query.priority,
    sort: query.sort === "name" ? "" : query.sort,
    dir: query.dir === "asc" ? "" : query.dir,
  }
}

export function applicationQueryRecord(query: ApplicationListQuery): Record<string, string> {
  return {
    q: query.q,
    status: query.status === "all" ? "" : query.status,
    companyId: query.companyId === "all" ? "" : query.companyId,
    source: query.source === "all" ? "" : query.source,
    sort: query.sort === "updated" ? "" : query.sort,
    dir: query.dir === "desc" ? "" : query.dir,
  }
}

export function isFollowUpDue(date: string | null, today: string): boolean {
  return Boolean(date && date <= today)
}

export const companyFilterOptions = {
  sizes: COMPANY_SIZES,
  researchStatuses: RESEARCH_STATUSES,
  priorities: PRIORITY_TIERS,
}

export function searchParamsToURL(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const url = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") url.set(key, value)
    else if (Array.isArray(value) && value[0]) url.set(key, value[0])
  }
  return url
}
