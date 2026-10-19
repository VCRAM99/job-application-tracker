import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { contactFormSchema, preparationFormSchema, taskFormSchema } from "@/lib/records/schemas"
import { completedAtForStatus, referenceDecision } from "@/lib/records/logic"
import {
  buildDashboard,
  filterContacts,
  filterTasks,
  isOverdue,
  parseContactListQuery,
  preparationProgress,
  type ContactRecord,
  type TaskRecord,
} from "@/lib/records/tracker"

const companyId = "11111111-1111-4111-8111-111111111111"
const applicationId = "33333333-3333-4333-8333-333333333333"

function contact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    userId: "user-a",
    name: "Ada Lovelace",
    roleTitle: "Recruiter",
    organization: "Northwind",
    email: "ada@example.com",
    linkedinUrl: "https://linkedin.example/ada",
    companyId,
    companyName: "Northwind",
    applicationId,
    applicationTitle: "Engineer",
    relationshipType: "recruiter",
    outreachStatus: "contacted",
    lastContactedAt: "2026-10-01",
    nextFollowUpDate: "2026-10-18",
    notes: "intro",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    ...overrides,
  }
}

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    userId: "user-a",
    title: "Send thank-you",
    description: "after screen",
    status: "todo",
    priority: "high",
    dueDate: "2026-10-10",
    companyId,
    companyName: "Northwind",
    applicationId,
    applicationTitle: "Engineer",
    completedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    ...overrides,
  }
}

describe("networking and task validation", () => {
  it("requires a contact name and a task title", () => {
    expect(contactFormSchema.safeParse({
      name: " ",
      roleTitle: "",
      organization: "",
      email: "not-an-email",
      linkedinUrl: "linkedin.com/in/ada",
      companyId: "",
      applicationId: "",
      relationshipType: "recruiter",
      outreachStatus: "not_contacted",
      lastContactedAt: "",
      nextFollowUpDate: "",
      notes: "",
    }).success).toBe(false)
    expect(taskFormSchema.safeParse({
      title: "",
      description: "",
      status: "todo",
      priority: "low",
      dueDate: "",
      companyId: "",
      applicationId: "",
    }).success).toBe(false)
    expect(preparationFormSchema.safeParse({
      title: "System design notes",
      category: "system_design",
      status: "not_started",
      targetDate: "",
      resourceUrl: "",
      notes: "",
    }).success).toBe(true)
  })

  it("rejects a contact linked to another user's company or a mismatched application", () => {
    expect(referenceDecision({
      companyId,
      applicationId: null,
      companyOwned: false,
      applicationCompanyId: null,
    })).toMatchObject({ ok: false, field: "companyId" })
    expect(referenceDecision({
      companyId: null,
      applicationId,
      companyOwned: true,
      applicationCompanyId: null,
    })).toMatchObject({ ok: false, field: "applicationId" })
    expect(referenceDecision({
      companyId: "22222222-2222-4222-8222-222222222222",
      applicationId,
      companyOwned: true,
      applicationCompanyId: companyId,
    })).toMatchObject({ ok: false, field: "applicationId" })
    expect(referenceDecision({
      companyId: null,
      applicationId,
      companyOwned: true,
      applicationCompanyId: companyId,
    })).toEqual({ ok: true, companyId, applicationId })
  })
})

describe("tasks and preparation", () => {
  it("treats a past due date as overdue until the task is done", () => {
    expect(isOverdue("2026-10-18", "2026-10-19")).toBe(true)
    expect(isOverdue("2026-10-19", "2026-10-19")).toBe(false)
    const tasks = [
      task(),
      task({
        id: "77777777-7777-4777-8777-777777777777",
        title: "Done already",
        status: "done",
        dueDate: "2026-10-01",
        completedAt: "2026-10-02",
        priority: "low",
      }),
    ]
    expect(filterTasks(tasks, { q: "", status: "todo", priority: "all", sort: "due", dir: "asc" })).toHaveLength(1)
    expect(completedAtForStatus("done", "2026-10-19")).toBe("2026-10-19")
    expect(completedAtForStatus("todo", "2026-10-19")).toBeNull()
  })

  it("counts preparation progress from item statuses", () => {
    expect(preparationProgress([
      { status: "not_started" },
      { status: "in_progress" },
      { status: "completed" },
      { status: "completed" },
    ])).toEqual({ total: 4, notStarted: 1, inProgress: 1, completed: 2 })
    expect(preparationProgress([])).toEqual({ total: 0, notStarted: 0, inProgress: 0, completed: 0 })
  })

  it("filters contacts by overdue follow-up", () => {
    const query = parseContactListQuery(new URLSearchParams("followUp=overdue&relationship=nope"))
    expect(query.relationship).toBe("all")
    expect(filterContacts([
      contact(),
      contact({ id: "88888888-8888-4888-8888-888888888888", name: "Grace", nextFollowUpDate: "2026-10-20" }),
    ], query, "2026-10-19").map((item) => item.name)).toEqual(["Ada Lovelace"])
  })
})

describe("dashboard statistics", () => {
  it("counts active applications, interviews, offers, and the last seven days from real rows", () => {
    const metrics = buildDashboard({
      today: "2026-10-19",
      companies: [
        { id: companyId, name: "Northwind", priorityTier: "A", researchStatus: "researching", followUpDate: "2026-10-18" },
        { id: "22222222-2222-4222-8222-222222222222", name: "Closed Co", priorityTier: "A", researchStatus: "closed", followUpDate: null },
        { id: "99999999-9999-4999-8999-999999999999", name: "Later", priorityTier: "B", researchStatus: "active", followUpDate: "2026-10-25" },
      ],
      applications: [
        { id: applicationId, jobTitle: "Engineer", companyName: "Northwind", status: "technical_interview", appliedAt: "2026-10-15", nextFollowUpDate: "2026-10-21", updatedAt: "2026-10-18T00:00:00.000Z" },
        { id: "44444444-4444-4444-8444-444444444444", jobTitle: "Analyst", companyName: "Northwind", status: "offer", appliedAt: "2026-10-01", nextFollowUpDate: null, updatedAt: "2026-10-10T00:00:00.000Z" },
        { id: "12121212-1212-4121-8121-121212121212", jobTitle: "Saved role", companyName: "Northwind", status: "saved", appliedAt: null, nextFollowUpDate: null, updatedAt: "2026-10-19T00:00:00.000Z" },
        { id: "13131313-1313-4131-8131-131313131313", jobTitle: "Rejected", companyName: "Northwind", status: "rejected", appliedAt: "2026-10-19", nextFollowUpDate: null, updatedAt: "2026-10-19T00:00:00.000Z" },
      ],
      contacts: [{ id: "55555555-5555-4555-8555-555555555555", name: "Ada", nextFollowUpDate: "2026-10-12" }],
      tasks: [
        { id: "66666666-6666-4666-8666-666666666666", title: "Send thank-you", status: "todo", dueDate: "2026-10-10" },
        { id: "77777777-7777-4777-8777-777777777777", title: "Finished", status: "done", dueDate: "2026-10-01" },
      ],
      preparation: [{ status: "completed" }, { status: "not_started" }],
    })

    expect(metrics.companyCount).toBe(3)
    expect(metrics.applicationCount).toBe(4)
    expect(metrics.activeApplications).toBe(1)
    expect(metrics.interviews).toBe(1)
    expect(metrics.offers).toBe(1)
    expect(metrics.submittedLast7Days).toBe(2)
    expect(metrics.overdueTasks.map((item) => item.title)).toEqual(["Send thank-you"])
    expect(metrics.priorityCompanies.map((item) => item.name)).toEqual(["Northwind"])
    expect(metrics.recentApplications[0]?.jobTitle).toBe("Saved role")
    expect(metrics.overdueFollowUps.map((item) => item.label)).toEqual(["Ada", "Northwind"])
    expect(metrics.upcomingFollowUps.map((item) => item.label)).toEqual(["Engineer", "Later"])
    expect(metrics.preparation).toEqual({ total: 2, notStarted: 1, inProgress: 0, completed: 1 })
  })
})

describe("new table migration", () => {
  it("keeps ownership in the database and clears links instead of deleting contacts", () => {
    const sql = readFileSync(
      "supabase/migrations/20261019160000_networking_tasks_preparation.sql",
      "utf8",
    )
    expect(sql).toContain("drop constraint applications_applied_date_check")
    expect(sql).toContain("enable row level security")
    expect(sql).toContain("on delete set null (company_id)")
    expect(sql).toContain("on delete set null (application_id)")
    expect(sql).toContain("auth.uid() = user_id")
    expect(sql.toLowerCase()).not.toContain("service_role")
    expect(sql).not.toContain("using (true)")
  })
})
