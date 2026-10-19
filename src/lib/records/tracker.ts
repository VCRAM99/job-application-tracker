import {
  ACTIVE_APPLICATION_STATUSES,
  INTERVIEW_STATUSES,
  TASK_PRIORITY_RANK,
  isOutreachStatus,
  isPreparationCategory,
  isPreparationStatus,
  isRelationshipType,
  isTaskPriority,
  isTaskStatus,
  type ApplicationStatus,
  type OutreachStatus,
  type PreparationCategory,
  type PreparationStatus,
  type PriorityTier,
  type RelationshipType,
  type ResearchStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/records/constants"
import { addCalendarDays } from "@/lib/records/logic"

export type ContactRecord = {
  id: string
  userId: string
  name: string
  roleTitle: string | null
  organization: string | null
  email: string | null
  linkedinUrl: string | null
  companyId: string | null
  companyName: string | null
  applicationId: string | null
  applicationTitle: string | null
  relationshipType: RelationshipType
  outreachStatus: OutreachStatus
  lastContactedAt: string | null
  nextFollowUpDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type TaskRecord = {
  id: string
  userId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  companyId: string | null
  companyName: string | null
  applicationId: string | null
  applicationTitle: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ApplicationOption = {
  id: string
  jobTitle: string
  companyId: string
  companyName: string
}

export type PreparationRecord = {
  id: string
  userId: string
  title: string
  category: PreparationCategory
  status: PreparationStatus
  targetDate: string | null
  completedAt: string | null
  resourceUrl: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ContactListQuery = {
  q: string
  relationship: RelationshipType | "all"
  outreach: OutreachStatus | "all"
  followUp: "all" | "upcoming" | "overdue"
  sort: "name" | "followUp" | "updated"
  dir: "asc" | "desc"
}

export type TaskListQuery = {
  q: string
  status: TaskStatus | "all"
  priority: TaskPriority | "all"
  sort: "due" | "priority" | "title" | "updated"
  dir: "asc" | "desc"
}

export type PreparationListQuery = {
  q: string
  category: PreparationCategory | "all"
  status: PreparationStatus | "all"
  sort: "title" | "target" | "updated"
  dir: "asc" | "desc"
}

export function isOverdue(date: string | null, today: string): boolean {
  return Boolean(date && date < today)
}

export function isUpcoming(date: string | null, today: string): boolean {
  return Boolean(date && date >= today)
}

export function preparationProgress(items: Array<{ status: PreparationStatus }>): {
  total: number
  notStarted: number
  inProgress: number
  completed: number
} {
  const progress = { total: items.length, notStarted: 0, inProgress: 0, completed: 0 }
  for (const item of items) {
    if (item.status === "not_started") progress.notStarted += 1
    else if (item.status === "in_progress") progress.inProgress += 1
    else progress.completed += 1
  }
  return progress
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

export function filterContacts(
  contacts: ContactRecord[],
  query: ContactListQuery,
  today: string,
): ContactRecord[] {
  return contacts.filter((contact) => {
    if (query.relationship !== "all" && contact.relationshipType !== query.relationship) return false
    if (query.outreach !== "all" && contact.outreachStatus !== query.outreach) return false
    if (query.followUp === "overdue" && !isOverdue(contact.nextFollowUpDate, today)) return false
    if (query.followUp === "upcoming" && !isUpcoming(contact.nextFollowUpDate, today)) return false
    return includesQuery(query.q, [
      contact.name,
      contact.roleTitle,
      contact.organization,
      contact.email,
      contact.companyName,
      contact.applicationTitle,
      contact.notes,
    ])
  })
}

export function sortContacts(contacts: ContactRecord[], query: ContactListQuery): ContactRecord[] {
  const sorted = [...contacts]
  sorted.sort((left, right) => {
    let result = 0
    if (query.sort === "followUp") {
      result = compareDate(left.nextFollowUpDate, right.nextFollowUpDate, query.dir)
    } else if (query.sort === "updated") {
      result = compareDate(left.updatedAt, right.updatedAt, query.dir)
    } else {
      result = compareText(left.name, right.name, query.dir)
    }
    return result || compareText(left.name, right.name, "asc")
  })
  return sorted
}

export function filterTasks(tasks: TaskRecord[], query: TaskListQuery): TaskRecord[] {
  return tasks.filter((task) => {
    if (query.status !== "all" && task.status !== query.status) return false
    if (query.priority !== "all" && task.priority !== query.priority) return false
    return includesQuery(query.q, [
      task.title,
      task.description,
      task.companyName,
      task.applicationTitle,
    ])
  })
}

export function sortTasks(tasks: TaskRecord[], query: TaskListQuery): TaskRecord[] {
  const sorted = [...tasks]
  sorted.sort((left, right) => {
    let result = 0
    if (query.sort === "priority") {
      result = TASK_PRIORITY_RANK[left.priority] - TASK_PRIORITY_RANK[right.priority]
      if (query.dir === "desc") result = -result
    } else if (query.sort === "title") {
      result = compareText(left.title, right.title, query.dir)
    } else if (query.sort === "updated") {
      result = compareDate(left.updatedAt, right.updatedAt, query.dir)
    } else {
      result = compareDate(left.dueDate, right.dueDate, query.dir)
    }
    return result || compareText(left.title, right.title, "asc")
  })
  return sorted
}

export function filterPreparation(
  items: PreparationRecord[],
  query: PreparationListQuery,
): PreparationRecord[] {
  return items.filter((item) => {
    if (query.category !== "all" && item.category !== query.category) return false
    if (query.status !== "all" && item.status !== query.status) return false
    return includesQuery(query.q, [item.title, item.notes])
  })
}

export function sortPreparation(
  items: PreparationRecord[],
  query: PreparationListQuery,
): PreparationRecord[] {
  const sorted = [...items]
  sorted.sort((left, right) => {
    let result = 0
    if (query.sort === "target") {
      result = compareDate(left.targetDate, right.targetDate, query.dir)
    } else if (query.sort === "updated") {
      result = compareDate(left.updatedAt, right.updatedAt, query.dir)
    } else {
      result = compareText(left.title, right.title, query.dir)
    }
    return result || compareText(left.title, right.title, "asc")
  })
  return sorted
}

export type DashboardCompany = {
  id: string
  name: string
  priorityTier: PriorityTier
  researchStatus: ResearchStatus
  followUpDate: string | null
}

export type DashboardApplication = {
  id: string
  jobTitle: string
  companyName: string
  status: ApplicationStatus
  appliedAt: string | null
  nextFollowUpDate: string | null
  updatedAt: string
}

export type DashboardFollowUp = {
  id: string
  label: string
  detail: string
  href: string
  date: string
}

export type DashboardModel = {
  companyCount: number
  applicationCount: number
  activeApplications: number
  interviews: number
  offers: number
  submittedLast7Days: number
  upcomingFollowUps: DashboardFollowUp[]
  overdueFollowUps: DashboardFollowUp[]
  overdueTasks: Array<{ id: string; title: string; dueDate: string }>
  recentApplications: DashboardApplication[]
  priorityCompanies: DashboardCompany[]
  preparation: ReturnType<typeof preparationProgress>
}

const ACTIVE = new Set<string>(ACTIVE_APPLICATION_STATUSES)
const INTERVIEWS = new Set<string>(INTERVIEW_STATUSES)

export function buildDashboard(input: {
  companies: DashboardCompany[]
  applications: DashboardApplication[]
  contacts: Array<{ id: string; name: string; nextFollowUpDate: string | null }>
  tasks: Array<{ id: string; title: string; status: TaskStatus; dueDate: string | null }>
  preparation: Array<{ status: PreparationStatus }>
  today: string
}): DashboardModel {
  const windowStart = addCalendarDays(input.today, -6)
  const followUps: DashboardFollowUp[] = []

  for (const company of input.companies) {
    if (!company.followUpDate) continue
    followUps.push({
      id: `company-${company.id}`,
      label: company.name,
      detail: "Company",
      href: `/companies/${company.id}`,
      date: company.followUpDate,
    })
  }
  for (const application of input.applications) {
    if (!application.nextFollowUpDate) continue
    followUps.push({
      id: `application-${application.id}`,
      label: application.jobTitle,
      detail: application.companyName,
      href: `/applications/${application.id}`,
      date: application.nextFollowUpDate,
    })
  }
  for (const contact of input.contacts) {
    if (!contact.nextFollowUpDate) continue
    followUps.push({
      id: `contact-${contact.id}`,
      label: contact.name,
      detail: "Contact",
      href: `/networking/${contact.id}`,
      date: contact.nextFollowUpDate,
    })
  }

  followUps.sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0))

  const recent = [...input.applications].sort((left, right) =>
    left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0,
  )

  return {
    companyCount: input.companies.length,
    applicationCount: input.applications.length,
    activeApplications: input.applications.filter((item) => ACTIVE.has(item.status)).length,
    interviews: input.applications.filter((item) => INTERVIEWS.has(item.status)).length,
    offers: input.applications.filter((item) => item.status === "offer").length,
    submittedLast7Days: input.applications.filter(
      (item) => item.appliedAt !== null && item.appliedAt >= windowStart && item.appliedAt <= input.today,
    ).length,
    upcomingFollowUps: followUps.filter((item) => item.date >= input.today).slice(0, 8),
    overdueFollowUps: followUps.filter((item) => item.date < input.today).slice(0, 8),
    overdueTasks: input.tasks
      .filter((task) => task.status !== "done" && isOverdue(task.dueDate, input.today))
      .sort((left, right) => (left.dueDate ?? "").localeCompare(right.dueDate ?? ""))
      .slice(0, 8)
      .map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate ?? "" })),
    recentApplications: recent.slice(0, 5),
    priorityCompanies: input.companies
      .filter(
        (company) =>
          (company.priorityTier === "A" || company.priorityTier === "B") &&
          company.researchStatus !== "closed" &&
          (company.followUpDate === null || company.followUpDate <= input.today),
      )
      .slice(0, 6),
    preparation: preparationProgress(input.preparation),
  }
}

function first(params: URLSearchParams, key: string): string {
  return params.get(key)?.trim() ?? ""
}

export function parseContactListQuery(params: URLSearchParams): ContactListQuery {
  const relationship = first(params, "relationship")
  const outreach = first(params, "outreach")
  const followUp = first(params, "followUp")
  const sort = first(params, "sort")
  const dir = first(params, "dir")
  return {
    q: first(params, "q"),
    relationship: isRelationshipType(relationship) ? relationship : "all",
    outreach: isOutreachStatus(outreach) ? outreach : "all",
    followUp: followUp === "upcoming" || followUp === "overdue" ? followUp : "all",
    sort: sort === "followUp" || sort === "updated" || sort === "name" ? sort : "name",
    dir: dir === "desc" ? "desc" : "asc",
  }
}

export function parseTaskListQuery(params: URLSearchParams): TaskListQuery {
  const status = first(params, "status")
  const priority = first(params, "priority")
  const sort = first(params, "sort")
  const dir = first(params, "dir")
  return {
    q: first(params, "q"),
    status: isTaskStatus(status) ? status : "all",
    priority: isTaskPriority(priority) ? priority : "all",
    sort: sort === "priority" || sort === "title" || sort === "updated" || sort === "due" ? sort : "due",
    dir: dir === "desc" ? "desc" : "asc",
  }
}

export function parsePreparationListQuery(params: URLSearchParams): PreparationListQuery {
  const category = first(params, "category")
  const status = first(params, "status")
  const sort = first(params, "sort")
  const dir = first(params, "dir")
  return {
    q: first(params, "q"),
    category: isPreparationCategory(category) ? category : "all",
    status: isPreparationStatus(status) ? status : "all",
    sort: sort === "target" || sort === "updated" || sort === "title" ? sort : "title",
    dir: dir === "desc" ? "desc" : "asc",
  }
}
