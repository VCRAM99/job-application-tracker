export const MAX_IMPORT_BYTES = 1_048_576
export const MAX_IMPORT_ROWS = 500

export function rejectImportFile(name: string, size: number): string | null {
  const lower = name.toLowerCase()
  if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx")) return "Use a .csv or .xlsx file."
  if (size <= 0) return "The file is empty."
  if (size > MAX_IMPORT_BYTES) return "The file is larger than 1 MB."
  return null
}

export const COMPANY_HEADERS = [
  "Company Name",
  "Size",
  "Location",
  "Industry",
  "Research Status",
  "Priority Tier",
  "Reference",
  "Website URL",
  "Notes",
  "Follow-up Date",
] as const

export const APPLICATION_HEADERS = [
  "Company Name",
  "Job Title",
  "Job URL",
  "Source",
  "Location",
  "Work Arrangement",
  "Employment Type",
  "Salary Min",
  "Salary Max",
  "Salary Currency",
  "Status",
  "Applied Date",
  "Next Follow-up Date",
  "Notes",
] as const

export type ImportKind = "companies" | "applications"

export function headersFor(kind: ImportKind): readonly string[] {
  return kind === "companies" ? COMPANY_HEADERS : APPLICATION_HEADERS
}

export function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

export function displayLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function normalizeJobUrl(value: string | null | undefined): string {
  if (!value) return ""
  return value.trim().replace(/\/+$/, "").toLowerCase()
}

export function applicationDuplicateKey(input: {
  companyName: string
  jobTitle: string
  jobUrl: string | null
}): string {
  return `${normalizeLabel(input.companyName)}\u0000${normalizeLabel(input.jobTitle)}\u0000${normalizeJobUrl(input.jobUrl)}`
}

export function neutralizeSpreadsheetFormula(value: string): string {
  const trimmed = value.trimStart()
  if (trimmed.length > 0 && /^[=+\-@]/.test(trimmed)) return `'${value}`
  return value
}

export function escapeCsvCell(value: string): string {
  const safe = neutralizeSpreadsheetFormula(value)
  if (/[",\n\r]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`
  return safe
}

export function toCsv(headers: readonly string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell ?? "")).join(","))
  }
  return `${lines.join("\r\n")}\r\n`
}

export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}
