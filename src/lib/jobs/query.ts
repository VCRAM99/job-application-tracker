import { isMissingTable } from "@/lib/records/logic"

export const JOB_PAGE_SIZE = 10

export const ARRANGEMENT_OPTIONS = ["remote", "hybrid", "onsite"] as const
export const SENIORITY_OPTIONS = ["intern", "junior", "mid", "senior", "staff", "principal", "manager"] as const
export const EMPLOYMENT_OPTIONS = ["full_time", "part_time", "contract", "internship"] as const
export const SORT_OPTIONS = ["relevance", "recency", "company"] as const

export type JobSort = (typeof SORT_OPTIONS)[number]

export type JobSearchState = {
  keywords: string
  countries: string[]
  locations: string[]
  workArrangements: string[]
  seniorities: string[]
  employmentTypes: string[]
  salaryMin: string
  salaryCurrency: string
  includeUnknownCompensation: boolean
  postedWithinDays: string
  excludeEasyApply: boolean
  preferredOnly: boolean
  savedOnly: boolean
  includeHidden: boolean
  sort: JobSort
  page: number
}

export const emptyJobSearch: JobSearchState = {
  keywords: "",
  countries: [],
  locations: [],
  workArrangements: [],
  seniorities: [],
  employmentTypes: [],
  salaryMin: "",
  salaryCurrency: "USD",
  includeUnknownCompensation: true,
  postedWithinDays: "",
  excludeEasyApply: false,
  preferredOnly: false,
  savedOnly: false,
  includeHidden: false,
  sort: "relevance",
  page: 1,
}

function list(params: URLSearchParams, key: string, allowed: readonly string[]): string[] {
  return params
    .getAll(key)
    .map((value) => value.trim())
    .filter((value) => allowed.includes(value))
}

export function parseJobSearch(params: URLSearchParams, defaults: JobSearchState = emptyJobSearch): JobSearchState {
  if (params.get("applied") !== "1") return { ...defaults, page: positivePage(params.get("page")) }
  const posted = params.get("posted") ?? ""
  const sort = params.get("sort")
  return {
    keywords: (params.get("q") ?? "").trim().slice(0, 120),
    countries: list(params, "country", ["CA", "US"]),
    locations: (params.get("location") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 12),
    workArrangements: list(params, "arrangement", ARRANGEMENT_OPTIONS),
    seniorities: list(params, "seniority", SENIORITY_OPTIONS),
    employmentTypes: list(params, "employment", EMPLOYMENT_OPTIONS),
    salaryMin: /^\d+(\.\d{1,2})?$/.test(params.get("salary") ?? "") ? (params.get("salary") ?? "") : "",
    salaryCurrency: /^[A-Za-z]{3}$/.test(params.get("currency") ?? "")
      ? (params.get("currency") ?? "USD").toUpperCase()
      : "USD",
    includeUnknownCompensation:
      params.get("hideUnknownSalary") !== "on" &&
      params.get("hideUnknownSalary") !== "1" &&
      params.get("unknownSalary") !== "0",
    postedWithinDays: ["7", "30", "90"].includes(posted) ? posted : "",
    excludeEasyApply: params.get("easyApply") === "1",
    preferredOnly: params.get("preferred") === "1",
    savedOnly: params.get("saved") === "1",
    includeHidden: params.get("hidden") === "1",
    sort: sort === "recency" || sort === "company" ? sort : "relevance",
    page: positivePage(params.get("page")),
  }
}

function positivePage(value: string | null): number {
  const page = Number(value)
  if (!Number.isInteger(page) || page < 1) return 1
  return page
}

export function jobSearchParams(state: JobSearchState): URLSearchParams {
  const params = new URLSearchParams()
  params.set("applied", "1")
  if (state.keywords) params.set("q", state.keywords)
  for (const country of state.countries) params.append("country", country)
  if (state.locations.length > 0) params.set("location", state.locations.join(", "))
  for (const value of state.workArrangements) params.append("arrangement", value)
  for (const value of state.seniorities) params.append("seniority", value)
  for (const value of state.employmentTypes) params.append("employment", value)
  if (state.salaryMin) params.set("salary", state.salaryMin)
  if (state.salaryCurrency) params.set("currency", state.salaryCurrency)
  if (!state.includeUnknownCompensation) params.set("hideUnknownSalary", "on")
  if (state.postedWithinDays) params.set("posted", state.postedWithinDays)
  if (state.excludeEasyApply) params.set("easyApply", "1")
  if (state.preferredOnly) params.set("preferred", "1")
  if (state.savedOnly) params.set("saved", "1")
  if (state.includeHidden) params.set("hidden", "1")
  if (state.sort !== "relevance") params.set("sort", state.sort)
  if (state.page > 1) params.set("page", String(state.page))
  return params
}

export function searchPayload(state: JobSearchState) {
  return {
    keywords: state.keywords,
    countries: state.countries,
    locations: state.locations,
    workArrangements: state.workArrangements,
    seniorities: state.seniorities,
    employmentTypes: state.employmentTypes,
    salaryMin: state.salaryMin ? Number(state.salaryMin) : null,
    salaryCurrency: state.salaryCurrency,
    includeUnknownCompensation: state.includeUnknownCompensation,
    postedWithinDays: state.postedWithinDays ? Number(state.postedWithinDays) : null,
    excludeEasyApply: state.excludeEasyApply,
    preferredOnly: state.preferredOnly,
    savedOnly: state.savedOnly,
    includeHidden: state.includeHidden,
    sort: state.sort,
    limit: JOB_PAGE_SIZE,
    offset: (state.page - 1) * JOB_PAGE_SIZE,
  }
}

export function jobsErrorKind(error: { code?: string; message?: string } | null): "missing_table" | "unavailable" {
  if (!error) return "unavailable"
  if (isMissingTable(error) || error.code === "PGRST202") return "missing_table"
  return "unavailable"
}

export function isTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}
