export type CompensationFacts = {
  compensationMin: number | null
  compensationMax: number | null
  currency: string | null
  salaryPeriod: string
}

export type HardFilterInput = {
  countries: string[]
  workArrangements: string[]
  employmentTypes: string[]
  seniorities: string[]
  salaryMin: number | null
  salaryCurrency: string | null
  includeUnknownCompensation: boolean
  excludeEasyApply: boolean
  postedWithinDays: number | null
  excludedEmployerIds: string[]
  locations: string[]
  keywords: string
}

export type FilterPosting = CompensationFacts & {
  countryCode: string | null
  workArrangement: string
  employmentType: string
  seniority: string
  applicationMethod: string
  postedAt: string | null
  employerId: string | null
  locationText: string | null
  title: string
  skills: string[]
}

export type CompensationFit = "pass" | "fail" | "unknown"

/** Comparable only for yearly amounts in the same currency. Everything else stays unknown. */
export function compensationFit(
  posting: CompensationFacts,
  salaryMin: number | null,
  salaryCurrency: string | null,
): CompensationFit {
  if (salaryMin == null) return "pass"
  const comparable =
    posting.salaryPeriod === "year" &&
    posting.currency != null &&
    salaryCurrency != null &&
    posting.currency.toUpperCase() === salaryCurrency.toUpperCase()
  if (!comparable) return "unknown"
  if (posting.compensationMax != null && posting.compensationMax < salaryMin) return "fail"
  if (
    posting.compensationMin != null &&
    posting.compensationMin >= salaryMin &&
    (posting.compensationMax == null || posting.compensationMax >= salaryMin)
  ) {
    return "pass"
  }
  return "unknown"
}

export function passesHardFilters(posting: FilterPosting, filters: HardFilterInput, now: Date): boolean {
  if (filters.countries.length > 0 && (!posting.countryCode || !filters.countries.includes(posting.countryCode))) {
    return false
  }
  if (filters.workArrangements.length > 0 && !filters.workArrangements.includes(posting.workArrangement)) {
    return false
  }
  if (filters.employmentTypes.length > 0 && !filters.employmentTypes.includes(posting.employmentType)) {
    return false
  }
  if (filters.seniorities.length > 0 && !filters.seniorities.includes(posting.seniority)) {
    return false
  }
  if (filters.excludeEasyApply && posting.applicationMethod === "easy_apply") return false
  if (posting.employerId && filters.excludedEmployerIds.includes(posting.employerId)) return false
  if (filters.locations.length > 0) {
    const location = (posting.locationText ?? "").toLowerCase()
    if (!filters.locations.some((item) => location.includes(item.toLowerCase()))) return false
  }
  const keyword = filters.keywords.trim().toLowerCase()
  if (keyword) {
    const haystack = [posting.title, posting.locationText ?? "", ...posting.skills].join(" ").toLowerCase()
    if (!haystack.includes(keyword)) return false
  }
  if (filters.postedWithinDays != null) {
    if (!posting.postedAt) return false
    const posted = new Date(posting.postedAt)
    if (Number.isNaN(posted.getTime())) return false
    const age = now.getTime() - posted.getTime()
    if (age > filters.postedWithinDays * 86_400_000) return false
  }
  const pay = compensationFit(posting, filters.salaryMin, filters.salaryCurrency)
  if (pay === "fail") return false
  if (pay === "unknown" && filters.salaryMin != null && !filters.includeUnknownCompensation) return false
  return true
}
