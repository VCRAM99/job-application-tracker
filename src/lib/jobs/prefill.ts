import { normalizeEmployerName, normalizeJobUrl } from "@/lib/jobs/text"

export type CompanyChoice = { id: string; name: string }

export type CompanyPlan =
  | { mode: "new"; companyId: ""; newCompanyName: string; ambiguous: false; matches: [] }
  | { mode: "existing"; companyId: string; newCompanyName: ""; ambiguous: false; matches: CompanyChoice[] }
  | { mode: "existing"; companyId: ""; newCompanyName: ""; ambiguous: true; matches: CompanyChoice[] }

export function matchingCompanies(companies: readonly CompanyChoice[], employerName: string): CompanyChoice[] {
  const target = normalizeEmployerName(employerName)
  if (!target) return []
  return companies.filter((company) => normalizeEmployerName(company.name) === target)
}

/** Never picks one company when several private records share the name. */
export function planCompany(companies: readonly CompanyChoice[], employerName: string): CompanyPlan {
  const matches = matchingCompanies(companies, employerName)
  if (matches.length === 1) {
    const match = matches[0]
    if (!match) return { mode: "new", companyId: "", newCompanyName: employerName, ambiguous: false, matches: [] }
    return { mode: "existing", companyId: match.id, newCompanyName: "", ambiguous: false, matches }
  }
  if (matches.length > 1) {
    return { mode: "existing", companyId: "", newCompanyName: "", ambiguous: true, matches }
  }
  return { mode: "new", companyId: "", newCompanyName: employerName, ambiguous: false, matches: [] }
}

export function companyChoiceIsExplicit(
  plan: CompanyPlan,
  submitted: { mode: "existing" | "new"; companyId: string },
): boolean {
  if (!plan.ambiguous) return true
  if (submitted.mode === "new") return true
  return submitted.companyId.length > 0
}

export type TrackerPrefill = {
  jobTitle: string
  jobUrl: string
  source: string
  location: string
  workArrangement: string
  employmentType: string
  salaryMin: string
  salaryMax: string
  salaryCurrency: string
  status: "saved"
  appliedAt: ""
  notes: string
}

export function prefillFromPosting(posting: {
  title: string
  listingUrl: string
  applicationUrl: string | null
  source: string
  locationText: string | null
  workArrangement: string
  employmentType: string
  compensationMin: number | null
  compensationMax: number | null
  currency: string | null
  salaryPeriod: string
  requisitionId: string | null
}): TrackerPrefill {
  const annual = posting.salaryPeriod === "year"
  const notes: string[] = []
  if (posting.requisitionId) notes.push(`Requisition ID: ${posting.requisitionId}`)
  if (!annual && (posting.compensationMin != null || posting.compensationMax != null)) {
    const currency = posting.currency ?? "currency not provided"
    const period = posting.salaryPeriod === "unknown" ? "period not provided" : posting.salaryPeriod
    notes.push(
      `Listed compensation was not copied into the salary fields because it is not a yearly amount (${currency}, ${period}).`,
    )
  }
  return {
    jobTitle: posting.title,
    jobUrl: posting.applicationUrl || posting.listingUrl,
    source: posting.source,
    location: posting.locationText ?? "",
    workArrangement: posting.workArrangement,
    employmentType: posting.employmentType,
    salaryMin: annual && posting.compensationMin != null ? String(posting.compensationMin) : "",
    salaryMax: annual && posting.compensationMax != null ? String(posting.compensationMax) : "",
    salaryCurrency: posting.currency ?? "USD",
    status: "saved",
    appliedAt: "",
    notes: notes.join("\n"),
  }
}

export function findDuplicateApplication(
  applications: readonly { id: string; jobTitle: string; jobUrl: string | null }[],
  candidate: { jobTitle: string; jobUrl: string | null },
): string | null {
  const title = candidate.jobTitle.trim().toLowerCase()
  const url = normalizeJobUrl(candidate.jobUrl)
  if (!title || !url) return null
  const match = applications.find(
    (application) =>
      application.jobTitle.trim().toLowerCase() === title && normalizeJobUrl(application.jobUrl) === url,
  )
  return match?.id ?? null
}
