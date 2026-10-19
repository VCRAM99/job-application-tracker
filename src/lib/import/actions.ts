"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/session"
import { parseCsv, rowsToRecords, CsvParseError } from "@/lib/import/csv"
import { headersFor, rejectImportFile, type ImportKind } from "@/lib/import/format"
import { canCommit, reviewApplications, reviewCompanies, type ImportReview } from "@/lib/import/plan"
import { parseXlsx } from "@/lib/import/xlsx"
import type { ApplicationImportValues, CompanyImportValues } from "@/lib/import/validate"
import { createClient } from "@/lib/supabase/server"

export type ImportResult = {
  inserted: number
  skipped: number
  companiesCreated: number
}

export type ImportState = {
  review: ImportReview | null
  result: ImportResult | null
  message: string | null
}

function fileRejection(file: File): string | null {
  return rejectImportFile(file.name, file.size)
}

async function recordsFrom(file: File, kind: ImportKind) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (file.name.toLowerCase().endsWith(".csv")) {
    let text = ""
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      throw new CsvParseError("The CSV must be UTF-8 text.")
    }
    return rowsToRecords(parseCsv(text), headersFor(kind)).records
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new CsvParseError("The file is not an .xlsx spreadsheet.")
  }
  return parseXlsx(bytes, kind)
}

async function existingFor(userId: string, kind: ImportKind) {
  const supabase = await createClient()
  const companies = await supabase.from("companies").select("id, name").eq("user_id", userId)
  if (companies.error) throw new Error(companies.error.message)
  const names = ((companies.data ?? []) as Array<{ id: string; name: string }>).map((row) => row.name)
  if (kind === "companies") return { names, applications: [] as Array<{ companyName: string; jobTitle: string; jobUrl: string | null }> }

  const applications = await supabase
    .from("applications")
    .select("job_title, job_url, company_id")
    .eq("user_id", userId)
  if (applications.error) throw new Error(applications.error.message)
  const byId = new Map(
    ((companies.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  )
  return {
    names,
    applications: (
      (applications.data ?? []) as Array<{ job_title: string; job_url: string | null; company_id: string }>
    ).map((row) => ({
      companyName: byId.get(row.company_id) ?? "",
      jobTitle: row.job_title,
      jobUrl: row.job_url,
    })),
  }
}

function companyPayload(row: CompanyImportValues) {
  return {
    name: row["Company Name"],
    size: row.Size,
    location: row.Location,
    industry: row.Industry,
    research_status: row["Research Status"],
    priority_tier: row["Priority Tier"],
    reference: row.Reference,
    website_url: row["Website URL"],
    notes: row.Notes,
    follow_up_date: row["Follow-up Date"],
  }
}

function applicationPayload(row: ApplicationImportValues) {
  return {
    company_name: row["Company Name"],
    job_title: row["Job Title"],
    job_url: row["Job URL"],
    source: row.Source,
    location: row.Location,
    work_arrangement: row["Work Arrangement"],
    employment_type: row["Employment Type"],
    salary_min: row["Salary Min"],
    salary_max: row["Salary Max"],
    salary_currency: row["Salary Currency"],
    status: row.Status,
    applied_at: row["Applied Date"],
    next_follow_up_date: row["Next Follow-up Date"],
    notes: row.Notes,
  }
}

async function buildReview(file: File, kind: ImportKind, userId: string): Promise<ImportReview> {
  const records = await recordsFrom(file, kind)
  const existing = await existingFor(userId, kind)
  return kind === "companies"
    ? reviewCompanies(records, existing.names)
    : reviewApplications(records, { companies: existing.names, applications: existing.applications })
}

export async function submitImport(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser()
  const kindValue = formData.get("kind")
  const kind: ImportKind | null =
    kindValue === "companies" || kindValue === "applications" ? kindValue : null
  if (!kind) return { review: null, result: null, message: "Choose companies or applications." }

  const file = formData.get("file")
  if (!(file instanceof File)) return { review: null, result: null, message: "Choose a file." }
  const rejected = fileRejection(file)
  if (rejected) return { review: null, result: null, message: rejected }

  let review: ImportReview
  try {
    review = await buildReview(file, kind, user.id)
  } catch (error) {
    const message = error instanceof CsvParseError ? error.message : "The file could not be read."
    return { review: null, result: null, message }
  }

  if (formData.get("intent") !== "import") {
    return { review, result: null, message: null }
  }
  if (!canCommit(review)) {
    return {
      review,
      result: null,
      message: review.fileError ?? "Fix the errors before importing. Nothing was saved.",
    }
  }

  const supabase = await createClient()
  const payload =
    kind === "companies" ? review.companies.map(companyPayload) : review.applications.map(applicationPayload)
  const { data, error } = await supabase.rpc(
    kind === "companies" ? "import_companies" : "import_applications",
    { payload },
  )
  if (error) {
    const missing = error.code === "PGRST202" || /import_companies|import_applications|schema cache/i.test(error.message)
    return {
      review,
      result: null,
      message: missing
        ? "Import is not available yet. Apply the import migration, then try again. Nothing was saved."
        : "The import was not saved. Check the file and try again.",
    }
  }

  const result = data as {
    inserted?: number
    skipped?: number
    companies_created?: number
    applications_inserted?: number
    applications_skipped?: number
  }
  revalidatePath("/companies")
  revalidatePath("/applications")
  revalidatePath("/dashboard")
  return {
    review,
    result: {
      inserted: result.inserted ?? result.applications_inserted ?? 0,
      skipped: result.skipped ?? result.applications_skipped ?? 0,
      companiesCreated: result.companies_created ?? 0,
    },
    message: null,
  }
}
