import { formatSalary } from "@/lib/records/logic"

const PERIODS: Record<string, string> = {
  year: "per year",
  month: "per month",
  week: "per week",
  day: "per day",
  hour: "per hour",
}

export function formatCompensation(input: {
  compensationMin: number | null
  compensationMax: number | null
  currency: string | null
  salaryPeriod: string
}): string | null {
  if (input.compensationMin == null && input.compensationMax == null) return null
  const currency = input.currency ?? ""
  const amount = formatSalary(input.compensationMin, input.compensationMax, currency).replace(/^—$/, "")
  const period = PERIODS[input.salaryPeriod]
  if (!input.currency && !period) return `${amount} (currency and pay period not provided)`.trim()
  if (!period) return `${amount} (pay period not provided)`.trim()
  if (!input.currency) return `${amount} ${period} (currency not provided)`.trim()
  return `${amount} ${period}`
}

export function formatListingDate(input: {
  postedAt: string | null
  lastVerifiedAt: string | null
  listingStatus: string
}): string {
  const verified = input.lastVerifiedAt?.slice(0, 10)
  const posted = input.postedAt?.slice(0, 10)
  if (input.listingStatus === "expired") {
    return verified
      ? `Not in the latest successful refresh. Last checked ${verified}.`
      : "Not in the latest successful refresh."
  }
  if (verified && posted) return `Posted ${posted}. Last checked ${verified}.`
  if (verified) return `Last checked ${verified}. Posting date was not provided.`
  if (posted) return `Posted ${posted}. Not rechecked yet.`
  return "Posting date was not provided, and this listing has not been rechecked."
}

export const ARRANGEMENT_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Work arrangement not provided",
}

export const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  unknown: "Employment type not provided",
}

export const SENIORITY_LABELS: Record<string, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
  manager: "Manager",
  unknown: "Seniority not provided",
}

export const METHOD_LABELS: Record<string, string> = {
  easy_apply: "LinkedIn Easy Apply",
  ats: "Employer application form",
  external: "External application",
  email: "Email application",
  unknown: "Application method not provided",
}
