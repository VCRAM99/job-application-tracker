import type { ApplicationStatus } from "@/lib/records/constants"
import { requiresAppliedDate, transitionError } from "@/lib/records/constants"

export function statusChangeDecision(input: {
  from: ApplicationStatus
  to: ApplicationStatus
  appliedAt: string | null
}): { ok: true } | { ok: false; message: string } {
  const message = transitionError(input.from, input.to)
  if (message) return { ok: false, message }
  if (requiresAppliedDate(input.to) && !input.appliedAt) {
    return { ok: false, message: "Add an applied date before leaving Saved." }
  }
  return { ok: true }
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
