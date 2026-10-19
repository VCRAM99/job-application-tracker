import { isApplicationStatus, type ApplicationStatus } from "@/lib/records/constants"

export function statusChangeDecision(input: {
  from: ApplicationStatus
  to: ApplicationStatus
}): { ok: true } | { ok: false; message: string } {
  if (!isApplicationStatus(input.from) || !isApplicationStatus(input.to)) {
    return { ok: false, message: "Choose a valid status." }
  }
  return { ok: true }
}

export function todayDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function completedAtForStatus(
  status: "done" | "completed" | string,
  today: string,
): string | null {
  return status === "done" || status === "completed" ? today : null
}

export function referenceDecision(input: {
  companyId: string | null
  applicationId: string | null
  companyOwned: boolean
  applicationCompanyId: string | null
}):
  | { ok: true; companyId: string | null; applicationId: string | null }
  | { ok: false; field: "companyId" | "applicationId"; message: string } {
  if (input.companyId && !input.companyOwned) {
    return { ok: false, field: "companyId", message: "Choose one of your companies." }
  }
  if (input.applicationId && !input.applicationCompanyId) {
    return { ok: false, field: "applicationId", message: "Choose one of your applications." }
  }
  if (
    input.companyId &&
    input.applicationCompanyId &&
    input.companyId !== input.applicationCompanyId
  ) {
    return {
      ok: false,
      field: "applicationId",
      message: "That application belongs to a different company.",
    }
  }
  return {
    ok: true,
    companyId: input.applicationCompanyId ?? input.companyId,
    applicationId: input.applicationId,
  }
}

export function countByCompany(companyIds: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const companyId of companyIds) {
    counts.set(companyId, (counts.get(companyId) ?? 0) + 1)
  }
  return counts
}

export function withCompanyNames<T extends { companyId: string }>(
  rows: T[],
  companies: Array<{ id: string; name: string }>,
): Array<T & { companyName: string }> {
  const names = new Map(companies.map((company) => [company.id, company.name]))
  return rows.map((row) => ({
    ...row,
    companyName: names.get(row.companyId) ?? "Unavailable",
  }))
}

export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string,
): string {
  const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })
  if (min == null && max == null) return "—"
  if (min != null && max != null) return `${currency} ${amount.format(min)}–${amount.format(max)}`
  if (min != null) return `${currency} ${amount.format(min)}+`
  return `Up to ${currency} ${amount.format(max ?? 0)}`
}

export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache/i.test(error.message ?? "") ||
    /does not exist/i.test(error.message ?? "")
  )
}

export function recordErrorMessage(error: { code?: string; message?: string } | null): string {
  if (isMissingTable(error)) {
    return "These tables are not available yet. Apply the companies and applications migration, then reload."
  }
  if (error?.code === "23503" || error?.code === "42501") {
    return "That company is not available on your account."
  }
  if (error?.code === "23514") {
    return "One of the values is not allowed."
  }
  return "The record could not be saved. Try again."
}
