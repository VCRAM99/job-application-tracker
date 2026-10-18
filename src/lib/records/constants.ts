export const COMPANY_SIZES = ["small/startup", "medium", "large", "unknown"] as const
export type CompanySize = (typeof COMPANY_SIZES)[number]

export const RESEARCH_STATUSES = [
  "not_started",
  "researching",
  "ready_to_apply",
  "active",
  "paused",
  "closed",
] as const
export type ResearchStatus = (typeof RESEARCH_STATUSES)[number]

export const PRIORITY_TIERS = ["A", "B", "C", "unset"] as const
export type PriorityTier = (typeof PRIORITY_TIERS)[number]

export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "recruiter_screen",
  "technical_interview",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const WORK_ARRANGEMENTS = ["remote", "hybrid", "onsite", "unknown"] as const
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number]

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "unknown",
] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  "small/startup": "Small / startup",
  medium: "Medium",
  large: "Large",
  unknown: "Unknown",
}

export const RESEARCH_STATUS_LABELS: Record<ResearchStatus, string> = {
  not_started: "Not started",
  researching: "Researching",
  ready_to_apply: "Ready to apply",
  active: "Active",
  paused: "Paused",
  closed: "Closed",
}

export const PRIORITY_LABELS: Record<PriorityTier, string> = {
  A: "A",
  B: "B",
  C: "C",
  unset: "Unset",
}

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  recruiter_screen: "Recruiter Screen",
  technical_interview: "Technical Interview",
  final_interview: "Final Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
}

export const WORK_ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Unknown",
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  unknown: "Unknown",
}

export const PRIORITY_RANK: Record<PriorityTier, number> = {
  A: 0,
  B: 1,
  C: 2,
  unset: 3,
}

export function isCompanySize(value: string): value is CompanySize {
  return (COMPANY_SIZES as readonly string[]).includes(value)
}

export function isResearchStatus(value: string): value is ResearchStatus {
  return (RESEARCH_STATUSES as readonly string[]).includes(value)
}

export function isPriorityTier(value: string): value is PriorityTier {
  return (PRIORITY_TIERS as readonly string[]).includes(value)
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value)
}

export function isWorkArrangement(value: string): value is WorkArrangement {
  return (WORK_ARRANGEMENTS as readonly string[]).includes(value)
}

export function isEmploymentType(value: string): value is EmploymentType {
  return (EMPLOYMENT_TYPES as readonly string[]).includes(value)
}

export function statusRank(status: ApplicationStatus): number {
  return APPLICATION_STATUSES.indexOf(status)
}

export function requiresAppliedDate(status: ApplicationStatus): boolean {
  return status !== "saved"
}

const ACTIVE_PIPELINE: ApplicationStatus[] = [
  "saved",
  "applied",
  "recruiter_screen",
  "technical_interview",
  "final_interview",
  "offer",
]

export function canTransitionStatus(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  if (!isApplicationStatus(from) || !isApplicationStatus(to)) return false
  if (from === to) return true
  if (to === "rejected" || to === "withdrawn") return true
  if (from === "rejected" || from === "withdrawn") {
    return to === "saved" || to === "applied"
  }

  const fromIndex = ACTIVE_PIPELINE.indexOf(from)
  const toIndex = ACTIVE_PIPELINE.indexOf(to)
  return fromIndex !== -1 && toIndex !== -1 && Math.abs(fromIndex - toIndex) === 1
}

export function transitionError(
  from: ApplicationStatus,
  to: ApplicationStatus,
): string | null {
  if (canTransitionStatus(from, to)) return null
  if (from === "rejected" || from === "withdrawn") {
    return "Reopen a closed application as Saved or Applied."
  }
  return "Move one stage at a time, or mark the application Rejected or Withdrawn."
}
