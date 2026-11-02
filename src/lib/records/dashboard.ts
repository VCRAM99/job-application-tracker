import {
  ACTIVE_APPLICATION_STATUSES,
  INTERVIEW_STATUSES,
  type ApplicationStatus,
  type PreparationStatus,
  type PriorityTier,
  type ResearchStatus,
  type TaskStatus,
} from "@/lib/records/constants"
import { addCalendarDays } from "@/lib/records/logic"
import { isOverdue, preparationProgress } from "@/lib/records/tracker"

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
