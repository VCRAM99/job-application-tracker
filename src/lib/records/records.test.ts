import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  APPLICATION_STATUSES,
  canTransitionStatus,
  requiresAppliedDate,
  transitionError,
} from "@/lib/records/constants"
import { safeRecordPath } from "@/lib/records/form-state"
import { applicationMatchesCompany, recordsShareOwner } from "@/lib/records/ownership"
import {
  applicationFormSchema,
  companyFormSchema,
  fieldErrorsFrom,
} from "@/lib/records/schemas"
import {
  filterApplications,
  filterCompanies,
  parseApplicationListQuery,
  parseCompanyListQuery,
  sortApplications,
  sortCompanies,
  type ApplicationRecord,
  type CompanyRecord,
} from "@/lib/records/query"
import {
  countByCompany,
  formatSalary,
  isMissingTable,
  recordErrorMessage,
  statusChangeDecision,
  withCompanyNames,
} from "@/lib/records/logic"

const companyId = "11111111-1111-4111-8111-111111111111"
const otherCompanyId = "22222222-2222-4222-8222-222222222222"

function company(overrides: Partial<CompanyRecord> = {}): CompanyRecord {
  return {
    id: companyId,
    userId: "user-a",
    name: "Northwind",
    size: "medium",
    location: "Chicago",
    industry: "Logistics",
    researchStatus: "researching",
    priorityTier: "B",
    reference: "alumni",
    websiteUrl: "https://northwind.example",
    notes: "strong platform team",
    followUpDate: "2026-10-20",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    applicationCount: 1,
    ...overrides,
  }
}

function application(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "user-a",
    companyId,
    companyName: "Northwind",
    jobTitle: "Platform engineer",
    jobUrl: "https://jobs.example/platform",
    source: "Referral",
    location: "Remote",
    workArrangement: "remote",
    employmentType: "full_time",
    salaryMin: 140000,
    salaryMax: 180000,
    salaryCurrency: "USD",
    status: "applied",
    appliedAt: "2026-10-10",
    nextFollowUpDate: "2026-10-21",
    notes: "recruiter intro",
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-12T00:00:00.000Z",
    ...overrides,
  }
}

describe("company and application validation", () => {
  it("requires a company name and a job title", () => {
    const companyResult = companyFormSchema.safeParse({
      name: "  ",
      size: "unknown",
      location: "",
      industry: "",
      researchStatus: "not_started",
      priorityTier: "unset",
      reference: "",
      websiteUrl: "",
      notes: "",
      followUpDate: "",
    })
    const applicationResult = applicationFormSchema.safeParse({
      jobTitle: "",
      jobUrl: "",
      source: "",
      location: "",
      workArrangement: "unknown",
      employmentType: "unknown",
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "",
      status: "saved",
      appliedAt: "",
      nextFollowUpDate: "",
      notes: "",
      companyMode: "new",
      companyId: "",
      newCompanyName: "Acme",
    })

    expect(companyResult.success).toBe(false)
    expect(applicationResult.success).toBe(false)
    if (!companyResult.success) {
      expect(fieldErrorsFrom(companyResult.error).name).toBe("Name is required.")
    }
    if (!applicationResult.success) {
      expect(fieldErrorsFrom(applicationResult.error).jobTitle).toBe("Job title is required.")
    }
  })

  it("rejects a website without a scheme and a salary range that is inverted", () => {
    const companyResult = companyFormSchema.safeParse({
      name: "Acme",
      size: "small/startup",
      location: "",
      industry: "",
      researchStatus: "active",
      priorityTier: "A",
      reference: "",
      websiteUrl: "acme.example",
      notes: "",
      followUpDate: "",
    })
    const applicationResult = applicationFormSchema.safeParse({
      jobTitle: "Engineer",
      jobUrl: "https://jobs.example",
      source: "",
      location: "",
      workArrangement: "hybrid",
      employmentType: "full_time",
      salaryMin: "10",
      salaryMax: "2",
      salaryCurrency: "usd",
      status: "saved",
      appliedAt: "",
      nextFollowUpDate: "",
      notes: "",
      companyMode: "existing",
      companyId,
      newCompanyName: "",
    })

    expect(companyResult.success).toBe(false)
    expect(applicationResult.success).toBe(false)
    if (!applicationResult.success) {
      expect(fieldErrorsFrom(applicationResult.error).salaryMax).toMatch(/maximum/i)
    }
  })

  it("requires an applied date after Saved and a company selection", () => {
    const result = applicationFormSchema.safeParse({
      jobTitle: "Engineer",
      jobUrl: "",
      source: "",
      location: "",
      workArrangement: "onsite",
      employmentType: "contract",
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "USD",
      status: "applied",
      appliedAt: "",
      nextFollowUpDate: "",
      notes: "",
      companyMode: "existing",
      companyId: "not-a-uuid",
      newCompanyName: "",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = fieldErrorsFrom(result.error)
      expect(errors.appliedAt).toMatch(/applied date/i)
      expect(errors.companyId).toBe("Choose a company.")
    }
  })
})

describe("application status transitions", () => {
  it("allows one step, a closed outcome, and reopening to Saved or Applied", () => {
    expect(canTransitionStatus("saved", "applied")).toBe(true)
    expect(canTransitionStatus("applied", "saved")).toBe(true)
    expect(canTransitionStatus("saved", "offer")).toBe(false)
    expect(canTransitionStatus("technical_interview", "rejected")).toBe(true)
    expect(canTransitionStatus("offer", "withdrawn")).toBe(true)
    expect(canTransitionStatus("rejected", "applied")).toBe(true)
    expect(canTransitionStatus("withdrawn", "recruiter_screen")).toBe(false)
    expect(transitionError("saved", "offer")).toMatch(/one stage/i)
    expect(requiresAppliedDate("saved")).toBe(false)
    expect(requiresAppliedDate("applied")).toBe(true)
    expect(APPLICATION_STATUSES).toEqual([
      "saved",
      "applied",
      "recruiter_screen",
      "technical_interview",
      "final_interview",
      "offer",
      "rejected",
      "withdrawn",
    ])
  })

  it("blocks a status change that leaves Saved without an applied date", () => {
    expect(
      statusChangeDecision({ from: "saved", to: "applied", appliedAt: null }),
    ).toEqual({ ok: false, message: "Add an applied date before leaving Saved." })
    expect(statusChangeDecision({ from: "saved", to: "applied", appliedAt: "2026-10-18" })).toEqual({
      ok: true,
    })
    expect(statusChangeDecision({ from: "applied", to: "offer", appliedAt: "2026-10-18" }).ok).toBe(
      false,
    )
  })
})

describe("search and filters", () => {
  const companies = [
    company(),
    company({
      id: otherCompanyId,
      name: "Fabrikam",
      size: "large",
      researchStatus: "closed",
      priorityTier: "A",
      industry: "Finance",
      applicationCount: 3,
      followUpDate: null,
      updatedAt: "2026-10-18T00:00:00.000Z",
    }),
  ]
  const applications = [
    application(),
    application({
      id: "44444444-4444-4444-8444-444444444444",
      companyId: otherCompanyId,
      companyName: "Fabrikam",
      jobTitle: "Analyst",
      source: "LinkedIn",
      status: "saved",
      appliedAt: null,
      updatedAt: "2026-10-01T00:00:00.000Z",
    }),
  ]

  it("drops unknown query values and filters companies", () => {
    const query = parseCompanyListQuery(
      new URLSearchParams("q=north&size=nope&researchStatus=researching&priority=B&sort=nope"),
    )
    expect(query.size).toBe("all")
    expect(query.sort).toBe("name")
    expect(filterCompanies(companies, query).map((item) => item.name)).toEqual(["Northwind"])
  })

  it("sorts companies by priority and applications by status", () => {
    const byPriority = sortCompanies(companies, {
      ...parseCompanyListQuery(new URLSearchParams()),
      sort: "priority",
      dir: "asc",
    })
    expect(byPriority.map((item) => item.name)).toEqual(["Fabrikam", "Northwind"])

    const query = parseApplicationListQuery(
      new URLSearchParams("status=saved&companyId=" + otherCompanyId + "&source=LinkedIn&q=analyst"),
    )
    expect(filterApplications(applications, query)).toHaveLength(1)
    expect(
      sortApplications(applications, { ...query, status: "all", companyId: "all", source: "all", q: "", sort: "status", dir: "asc" }).map(
        (item) => item.status,
      ),
    ).toEqual(["saved", "applied"])
  })
})

describe("ownership", () => {
  it("only links an application to a company owned by the same user", () => {
    expect(recordsShareOwner("user-a", "user-a")).toBe(true)
    expect(recordsShareOwner("user-a", "user-b")).toBe(false)
    expect(
      applicationMatchesCompany({
        applicationUserId: "user-a",
        companyUserId: "user-b",
        applicationCompanyId: companyId,
        companyId,
      }),
    ).toBe(false)
    expect(withCompanyNames([{ companyId }], [{ id: otherCompanyId, name: "Other" }])[0]?.companyName).toBe(
      "Unavailable",
    )
    expect(countByCompany([companyId, companyId]).get(companyId)).toBe(2)
    expect(safeRecordPath(`/companies/${companyId}`, "/applications")).toBe(`/companies/${companyId}`)
    expect(safeRecordPath("https://evil.example", "/applications")).toBe("/applications")
  })

  it("keeps row access in the migration and avoids the service role", () => {
    const sql = readFileSync(
      "supabase/migrations/20261018204000_companies_and_applications.sql",
      "utf8",
    )
    expect(sql).toContain("enable row level security")
    expect(sql).toContain('auth.uid() = user_id')
    expect(sql).toContain("applications_company_owner_fkey")
    expect(sql).toContain("revoke all on table public.companies from anon, authenticated")
    expect(sql).toContain("grant execute on function public.assign_user_id() to authenticated")
    expect(sql).not.toContain("grant execute on function public.assign_user_id() to anon")
    expect(sql.toLowerCase()).not.toContain("service_role")
    expect(sql).not.toContain("using (true)")
    expect(isMissingTable({ code: "PGRST205", message: "schema cache" })).toBe(true)
    expect(recordErrorMessage({ code: "42501" })).toMatch(/not available on your account/i)
    expect(formatSalary(10, null, "USD")).toBe("USD 10+")
  })
})
