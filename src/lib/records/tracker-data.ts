import "server-only"

import { notFound } from "next/navigation"

import { requireUser } from "@/lib/auth/session"
import {
  isApplicationStatus,
  isOutreachStatus,
  isPreparationCategory,
  isPreparationStatus,
  isPriorityTier,
  isRelationshipType,
  isResearchStatus,
  isTaskPriority,
  isTaskStatus,
} from "@/lib/records/constants"
import type { DataResult } from "@/lib/records/data"
import { isUuid } from "@/lib/records/form-state"
import { isMissingTable } from "@/lib/records/logic"
import type {
  ApplicationOption,
  ContactRecord,
  DashboardApplication,
  DashboardCompany,
  PreparationRecord,
  TaskRecord,
} from "@/lib/records/tracker"
import { createClient } from "@/lib/supabase/server"

function failure(error: { code?: string; message?: string } | null): DataResult<never> {
  return { ok: false, error: isMissingTable(error) ? "missing_table" : "unavailable" }
}

type ContactRow = {
  id: string
  user_id: string
  name: string
  role_title: string | null
  organization: string | null
  email: string | null
  linkedin_url: string | null
  company_id: string | null
  application_id: string | null
  relationship_type: string
  outreach_status: string
  last_contacted_at: string | null
  next_follow_up_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type TaskRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  company_id: string | null
  application_id: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type PreparationRow = {
  id: string
  user_id: string
  title: string
  category: string
  status: string
  target_date: string | null
  completed_at: string | null
  resource_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function mapContact(
  row: ContactRow,
  companies: Map<string, string>,
  applications: Map<string, string>,
): ContactRecord | null {
  if (!isRelationshipType(row.relationship_type) || !isOutreachStatus(row.outreach_status)) return null
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    roleTitle: row.role_title,
    organization: row.organization,
    email: row.email,
    linkedinUrl: row.linkedin_url,
    companyId: row.company_id,
    companyName: row.company_id ? (companies.get(row.company_id) ?? "Unavailable") : null,
    applicationId: row.application_id,
    applicationTitle: row.application_id
      ? (applications.get(row.application_id) ?? "Unavailable")
      : null,
    relationshipType: row.relationship_type,
    outreachStatus: row.outreach_status,
    lastContactedAt: row.last_contacted_at,
    nextFollowUpDate: row.next_follow_up_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTask(
  row: TaskRow,
  companies: Map<string, string>,
  applications: Map<string, string>,
): TaskRecord | null {
  if (!isTaskStatus(row.status) || !isTaskPriority(row.priority)) return null
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    companyId: row.company_id,
    companyName: row.company_id ? (companies.get(row.company_id) ?? "Unavailable") : null,
    applicationId: row.application_id,
    applicationTitle: row.application_id
      ? (applications.get(row.application_id) ?? "Unavailable")
      : null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPreparation(row: PreparationRow): PreparationRecord | null {
  if (!isPreparationCategory(row.category) || !isPreparationStatus(row.status)) return null
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    category: row.category,
    status: row.status,
    targetDate: row.target_date,
    completedAt: row.completed_at,
    resourceUrl: row.resource_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function namesFor(userId: string) {
  const supabase = await createClient()
  const [companies, applications] = await Promise.all([
    supabase.from("companies").select("id, name").eq("user_id", userId),
    supabase.from("applications").select("id, job_title, company_id").eq("user_id", userId),
  ])
  return { companies, applications }
}

export async function listApplicationOptions(): Promise<DataResult<ApplicationOption[]>> {
  const user = await requireUser()
  const supabase = await createClient()
  const [applications, companies] = await Promise.all([
    supabase.from("applications").select("id, job_title, company_id").eq("user_id", user.id),
    supabase.from("companies").select("id, name").eq("user_id", user.id),
  ])
  if (applications.error) return failure(applications.error)
  if (companies.error) return failure(companies.error)
  const names = new Map(
    ((companies.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  )
  return {
    ok: true,
    data: (
      (applications.data ?? []) as Array<{ id: string; job_title: string; company_id: string }>
    ).map((row) => ({
      id: row.id,
      jobTitle: row.job_title,
      companyId: row.company_id,
      companyName: names.get(row.company_id) ?? "Unavailable",
    })),
  }
}

export async function listContacts(): Promise<DataResult<ContactRecord[]>> {
  const user = await requireUser()
  const supabase = await createClient()
  const [contacts, names] = await Promise.all([
    supabase.from("contacts").select("*").eq("user_id", user.id),
    namesFor(user.id),
  ])
  if (contacts.error) return failure(contacts.error)
  if (names.companies.error) return failure(names.companies.error)
  if (names.applications.error) return failure(names.applications.error)
  const companyNames = new Map(
    ((names.companies.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  )
  const applicationTitles = new Map(
    ((names.applications.data ?? []) as Array<{ id: string; job_title: string }>).map((row) => [
      row.id,
      row.job_title,
    ]),
  )
  return {
    ok: true,
    data: ((contacts.data ?? []) as ContactRow[])
      .map((row) => mapContact(row, companyNames, applicationTitles))
      .filter((row): row is ContactRecord => row !== null),
  }
}

export async function getContact(id: string): Promise<DataResult<ContactRecord | null>> {
  if (!isUuid(id)) notFound()
  const result = await listContacts()
  if (!result.ok) return result
  return { ok: true, data: result.data.find((contact) => contact.id === id) ?? null }
}

export async function listTasks(): Promise<DataResult<TaskRecord[]>> {
  const user = await requireUser()
  const supabase = await createClient()
  const [tasks, names] = await Promise.all([
    supabase.from("tasks").select("*").eq("user_id", user.id),
    namesFor(user.id),
  ])
  if (tasks.error) return failure(tasks.error)
  if (names.companies.error) return failure(names.companies.error)
  if (names.applications.error) return failure(names.applications.error)
  const companyNames = new Map(
    ((names.companies.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  )
  const applicationTitles = new Map(
    ((names.applications.data ?? []) as Array<{ id: string; job_title: string }>).map((row) => [
      row.id,
      row.job_title,
    ]),
  )
  return {
    ok: true,
    data: ((tasks.data ?? []) as TaskRow[])
      .map((row) => mapTask(row, companyNames, applicationTitles))
      .filter((row): row is TaskRecord => row !== null),
  }
}

export async function getTask(id: string): Promise<DataResult<TaskRecord | null>> {
  if (!isUuid(id)) notFound()
  const result = await listTasks()
  if (!result.ok) return result
  return { ok: true, data: result.data.find((task) => task.id === id) ?? null }
}

export async function listPreparation(): Promise<DataResult<PreparationRecord[]>> {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("preparation_items").select("*").eq("user_id", user.id)
  if (error) return failure(error)
  return {
    ok: true,
    data: ((data ?? []) as PreparationRow[])
      .map(mapPreparation)
      .filter((row): row is PreparationRecord => row !== null),
  }
}

export async function getPreparation(id: string): Promise<DataResult<PreparationRecord | null>> {
  if (!isUuid(id)) notFound()
  const result = await listPreparation()
  if (!result.ok) return result
  return { ok: true, data: result.data.find((item) => item.id === id) ?? null }
}

export type DashboardSources = {
  companies: DataResult<DashboardCompany[]>
  applications: DataResult<DashboardApplication[]>
  contacts: DataResult<Array<{ id: string; name: string; nextFollowUpDate: string | null }>>
  tasks: DataResult<Array<{ id: string; title: string; status: TaskRecord["status"]; dueDate: string | null }>>
  preparation: DataResult<Array<{ status: PreparationRecord["status"] }>>
}

export async function loadDashboardSources(): Promise<DashboardSources> {
  const user = await requireUser()
  const supabase = await createClient()
  const [companies, applications, contacts, tasks, preparation] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, priority_tier, research_status, follow_up_date")
      .eq("user_id", user.id),
    supabase
      .from("applications")
      .select("id, job_title, company_id, status, applied_at, next_follow_up_date, updated_at")
      .eq("user_id", user.id),
    supabase.from("contacts").select("id, name, next_follow_up_date").eq("user_id", user.id),
    supabase.from("tasks").select("id, title, status, due_date").eq("user_id", user.id),
    supabase.from("preparation_items").select("status").eq("user_id", user.id),
  ])

  const companyNames = new Map(
    ((companies.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  )

  return {
    companies: companies.error
      ? failure(companies.error)
      : {
          ok: true,
          data: ((companies.data ?? []) as Array<{
            id: string
            name: string
            priority_tier: string
            research_status: string
            follow_up_date: string | null
          }>)
            .filter((row) => isPriorityTier(row.priority_tier) && isResearchStatus(row.research_status))
            .map((row) => ({
              id: row.id,
              name: row.name,
              priorityTier: row.priority_tier as DashboardCompany["priorityTier"],
              researchStatus: row.research_status as DashboardCompany["researchStatus"],
              followUpDate: row.follow_up_date,
            })),
        },
    applications: applications.error
      ? failure(applications.error)
      : {
          ok: true,
          data: ((applications.data ?? []) as Array<{
            id: string
            job_title: string
            company_id: string
            status: string
            applied_at: string | null
            next_follow_up_date: string | null
            updated_at: string
          }>)
            .filter((row) => isApplicationStatus(row.status))
            .map((row) => ({
              id: row.id,
              jobTitle: row.job_title,
              companyName: companyNames.get(row.company_id) ?? "Unavailable",
              status: row.status as DashboardApplication["status"],
              appliedAt: row.applied_at,
              nextFollowUpDate: row.next_follow_up_date,
              updatedAt: row.updated_at,
            })),
        },
    contacts: contacts.error
      ? failure(contacts.error)
      : {
          ok: true,
          data: (
            (contacts.data ?? []) as Array<{
              id: string
              name: string
              next_follow_up_date: string | null
            }>
          ).map((row) => ({
            id: row.id,
            name: row.name,
            nextFollowUpDate: row.next_follow_up_date,
          })),
        },
    tasks: tasks.error
      ? failure(tasks.error)
      : {
          ok: true,
          data: ((tasks.data ?? []) as Array<{
            id: string
            title: string
            status: string
            due_date: string | null
          }>)
            .filter((row) => isTaskStatus(row.status))
            .map((row) => ({
              id: row.id,
              title: row.title,
              status: row.status as TaskRecord["status"],
              dueDate: row.due_date,
            })),
        },
    preparation: preparation.error
      ? failure(preparation.error)
      : {
          ok: true,
          data: ((preparation.data ?? []) as Array<{ status: string }>)
            .filter((row) => isPreparationStatus(row.status))
            .map((row) => ({ status: row.status as PreparationRecord["status"] })),
        },
  }
}
