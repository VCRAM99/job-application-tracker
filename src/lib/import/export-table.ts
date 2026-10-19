import { toCsv, COMPANY_HEADERS, APPLICATION_HEADERS } from "@/lib/import/format"
import type { ApplicationRecord, CompanyRecord } from "@/lib/records/query"

function text(value: string | null | undefined): string {
  return value ?? ""
}

function money(value: number | null): string {
  return value == null ? "" : String(value)
}

export function companiesToCsv(companies: CompanyRecord[]): string {
  return toCsv(
    COMPANY_HEADERS,
    companies.map((company) => [
      company.name,
      company.size,
      text(company.location),
      text(company.industry),
      company.researchStatus,
      company.priorityTier,
      text(company.reference),
      text(company.websiteUrl),
      text(company.notes),
      text(company.followUpDate),
    ]),
  )
}

export function applicationsToCsv(applications: ApplicationRecord[]): string {
  return toCsv(
    APPLICATION_HEADERS,
    applications.map((application) => [
      application.companyName,
      application.jobTitle,
      text(application.jobUrl),
      text(application.source),
      text(application.location),
      application.workArrangement,
      application.employmentType,
      money(application.salaryMin),
      money(application.salaryMax),
      application.salaryCurrency,
      application.status,
      text(application.appliedAt),
      text(application.nextFollowUpDate),
      text(application.notes),
    ]),
  )
}

export function namesForUser(
  rows: Array<{ userId: string; name: string }>,
  userId: string,
): string[] {
  return rows.filter((row) => row.userId === userId).map((row) => row.name)
}
