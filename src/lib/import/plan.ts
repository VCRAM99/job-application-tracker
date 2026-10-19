import { applicationDuplicateKey, displayLabel, normalizeLabel } from "@/lib/import/format"
import {
  applicationImportSchema,
  companyImportSchema,
  issuesFor,
  type ApplicationImportValues,
  type CompanyImportValues,
} from "@/lib/import/validate"
import { MAX_IMPORT_ROWS } from "@/lib/import/format"

export type ImportDecision = {
  row: number
  decision: "import" | "skip"
  reason: string
  label: string
  detail: string
}

export type ImportReview = {
  fileError: string | null
  errors: Array<{ row: number; messages: string[] }>
  decisions: ImportDecision[]
  blocked: boolean
  ready: number
  skipped: number
  companiesToCreate: number
  companies: CompanyImportValues[]
  applications: ApplicationImportValues[]
}

export function reviewCompanies(
  records: Array<{ row: number; values: Record<string, string> }>,
  existingNames: string[],
): ImportReview {
  const errors: ImportReview["errors"] = []
  const decisions: ImportDecision[] = []
  const companies: CompanyImportValues[] = []
  const existing = new Set(existingNames.map(normalizeLabel))
  const seenInFile = new Set<string>()

  if (records.length > MAX_IMPORT_ROWS) {
    return emptyReview(`The file has more than ${MAX_IMPORT_ROWS} data rows.`)
  }

  for (const record of records) {
    const parsed = companyImportSchema.safeParse(record.values)
    if (!parsed.success) {
      errors.push({ row: record.row, messages: issuesFor(parsed.error) })
      continue
    }
    const key = normalizeLabel(parsed.data["Company Name"])
    const label = displayLabel(parsed.data["Company Name"])
    if (existing.has(key) || seenInFile.has(key)) {
      decisions.push({
        row: record.row,
        decision: "skip",
        reason: seenInFile.has(key)
          ? "This company name is repeated in the file."
          : "This company is already in your account.",
        label,
        detail: "Company",
      })
      seenInFile.add(key)
      continue
    }
    seenInFile.add(key)
    companies.push({ ...parsed.data, "Company Name": label })
    decisions.push({
      row: record.row,
      decision: "import",
      reason: "Will be added.",
      label,
      detail: "Company",
    })
  }

  return finish(errors, decisions, companies, [])
}

export function reviewApplications(
  records: Array<{ row: number; values: Record<string, string> }>,
  existing: {
    companies: string[]
    applications: Array<{ companyName: string; jobTitle: string; jobUrl: string | null }>
  },
): ImportReview {
  if (records.length > MAX_IMPORT_ROWS) {
    return emptyReview(`The file has more than ${MAX_IMPORT_ROWS} data rows.`)
  }

  const errors: ImportReview["errors"] = []
  const decisions: ImportDecision[] = []
  const applications: ApplicationImportValues[] = []
  const companyNames = new Set(existing.companies.map(normalizeLabel))
  const created = new Set<string>()
  const storedApps = new Set(existing.applications.map(applicationDuplicateKey))
  const seenInFile = new Set<string>()

  for (const record of records) {
    const parsed = applicationImportSchema.safeParse(record.values)
    if (!parsed.success) {
      errors.push({ row: record.row, messages: issuesFor(parsed.error) })
      continue
    }
    const companyName = displayLabel(parsed.data["Company Name"])
    const jobTitle = displayLabel(parsed.data["Job Title"])
    const key = applicationDuplicateKey({
      companyName,
      jobTitle,
      jobUrl: parsed.data["Job URL"],
    })
    const companyKey = normalizeLabel(companyName)
    if (storedApps.has(key) || seenInFile.has(key)) {
      decisions.push({
        row: record.row,
        decision: "skip",
        reason: seenInFile.has(key)
          ? "This application is repeated in the file."
          : "This application is already in your account.",
        label: jobTitle,
        detail: companyName,
      })
      seenInFile.add(key)
      continue
    }
    seenInFile.add(key)
    const createsCompany = !companyNames.has(companyKey) && !created.has(companyKey)
    if (createsCompany) created.add(companyKey)
    companyNames.add(companyKey)
    applications.push({ ...parsed.data, "Company Name": companyName, "Job Title": jobTitle })
    decisions.push({
      row: record.row,
      decision: "import",
      reason: createsCompany ? "Will be added, and the company will be created." : "Will be added.",
      label: jobTitle,
      detail: companyName,
    })
  }

  const review = finish(errors, decisions, [], applications)
  if (!review.blocked) review.companiesToCreate = created.size
  return review
}

function finish(
  errors: ImportReview["errors"],
  decisions: ImportDecision[],
  companies: CompanyImportValues[],
  applications: ApplicationImportValues[],
): ImportReview {
  const ready = decisions.filter((decision) => decision.decision === "import").length
  const skipped = decisions.filter((decision) => decision.decision === "skip").length
  return {
    fileError: null,
    errors,
    decisions,
    blocked: errors.length > 0,
    ready: errors.length > 0 ? 0 : ready,
    skipped,
    companiesToCreate: 0,
    companies: errors.length > 0 ? [] : companies,
    applications: errors.length > 0 ? [] : applications,
  }
}

function emptyReview(fileError: string): ImportReview {
  return {
    fileError,
    errors: [],
    decisions: [],
    blocked: true,
    ready: 0,
    skipped: 0,
    companiesToCreate: 0,
    companies: [],
    applications: [],
  }
}

export function canCommit(review: ImportReview): boolean {
  return review.fileError === null && !review.blocked && review.errors.length === 0 && review.ready > 0
}
