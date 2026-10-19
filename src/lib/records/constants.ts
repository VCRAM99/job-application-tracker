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

export const ACTIVE_APPLICATION_STATUSES = [
  "applied",
  "recruiter_screen",
  "technical_interview",
  "final_interview",
] as const satisfies readonly ApplicationStatus[]

export const INTERVIEW_STATUSES = [
  "recruiter_screen",
  "technical_interview",
  "final_interview",
] as const satisfies readonly ApplicationStatus[]

export const RELATIONSHIP_TYPES = [
  "recruiter",
  "hiring_manager",
  "employee",
  "founder",
  "referral",
  "other",
] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

export const OUTREACH_STATUSES = [
  "not_contacted",
  "connection_sent",
  "contacted",
  "replied",
  "follow_up_needed",
  "closed",
] as const
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ["low", "medium", "high"] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const PREPARATION_CATEGORIES = [
  "certification",
  "coding",
  "system_design",
  "behavioral",
  "other",
] as const
export type PreparationCategory = (typeof PREPARATION_CATEGORIES)[number]

export const PREPARATION_STATUSES = ["not_started", "in_progress", "completed"] as const
export type PreparationStatus = (typeof PREPARATION_STATUSES)[number]

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
  employee: "Employee",
  founder: "Founder",
  referral: "Referral",
  other: "Other",
}

export const OUTREACH_LABELS: Record<OutreachStatus, string> = {
  not_contacted: "Not Contacted",
  connection_sent: "Connection Sent",
  contacted: "Contacted",
  replied: "Replied",
  follow_up_needed: "Follow-up Needed",
  closed: "Closed",
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export const PREPARATION_CATEGORY_LABELS: Record<PreparationCategory, string> = {
  certification: "Certification",
  coding: "Coding",
  system_design: "System Design",
  behavioral: "Behavioral",
  other: "Other",
}

export const PREPARATION_STATUS_LABELS: Record<PreparationStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
}

export function isRelationshipType(value: string): value is RelationshipType {
  return (RELATIONSHIP_TYPES as readonly string[]).includes(value)
}

export function isOutreachStatus(value: string): value is OutreachStatus {
  return (OUTREACH_STATUSES as readonly string[]).includes(value)
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value)
}

export function isPreparationCategory(value: string): value is PreparationCategory {
  return (PREPARATION_CATEGORIES as readonly string[]).includes(value)
}

export function isPreparationStatus(value: string): value is PreparationStatus {
  return (PREPARATION_STATUSES as readonly string[]).includes(value)
}

export function canTransitionStatus(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return isApplicationStatus(from) && isApplicationStatus(to)
}
