// @vitest-environment node

import { readFileSync } from "node:fs"

import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"

import { CsvParseError, parseCsv, rowsToRecords } from "@/lib/import/csv"
import { applicationsToCsv, companiesToCsv, namesForUser } from "@/lib/import/export-table"
import {
  APPLICATION_HEADERS,
  COMPANY_HEADERS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  applicationDuplicateKey,
  headersFor,
  isRealIsoDate,
  neutralizeSpreadsheetFormula,
  rejectImportFile,
  toCsv,
} from "@/lib/import/format"
import { canCommit, reviewApplications, reviewCompanies } from "@/lib/import/plan"
import { parseXlsx, templateWorkbook } from "@/lib/import/xlsx"
import type { ApplicationRecord, CompanyRecord } from "@/lib/records/query"

function companyRow(overrides: Partial<Record<(typeof COMPANY_HEADERS)[number], string>> = {}) {
  return COMPANY_HEADERS.map((header) => overrides[header] ?? "")
}

function applicationRow(
  overrides: Partial<Record<(typeof APPLICATION_HEADERS)[number], string>> = {},
) {
  return APPLICATION_HEADERS.map((header) => overrides[header] ?? "")
}

function companyRecords(rows: string[][]) {
  return rowsToRecords(parseCsv(toCsv(COMPANY_HEADERS, rows)), COMPANY_HEADERS).records
}

function applicationRecords(rows: string[][]) {
  return rowsToRecords(parseCsv(toCsv(APPLICATION_HEADERS, rows)), APPLICATION_HEADERS).records
}

const company: CompanyRecord = {
  id: "company-1",
  userId: "user-a",
  name: "Northwind",
  size: "medium",
  location: "Austin, TX",
  industry: "Software",
  researchStatus: "researching",
  priorityTier: "A",
  reference: 'Pat "P" Lee',
  websiteUrl: "https://northwind.example",
  notes: "Line one\nLine two",
  followUpDate: "2026-04-01",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  applicationCount: 1,
}

const application: ApplicationRecord = {
  id: "application-1",
  userId: "user-a",
  companyId: "company-1",
  companyName: "Northwind",
  jobTitle: "Engineer",
  jobUrl: "https://jobs.example/role",
  source: "Referral",
  location: "Remote",
  workArrangement: "remote",
  employmentType: "full_time",
  salaryMin: 100000,
  salaryMax: 140000.5,
  salaryCurrency: "USD",
  status: "applied",
  appliedAt: "2026-03-15",
  nextFollowUpDate: "2026-03-20",
  notes: "Ask about the team",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
}

describe("csv parsing", () => {
  it("parses quotes, commas, newlines, and a byte-order mark", () => {
    const parsed = parseCsv(`\uFEFFName,Notes\r\n"Acme","He said ""hi"", then left"\r\n"Beta","line 1\nline 2"\r\n`)
    expect(parsed).toEqual([
      ["Name", "Notes"],
      ["Acme", 'He said "hi", then left'],
      ["Beta", "line 1\nline 2"],
    ])
  })

  it("rejects broken csv text", () => {
    expect(() => parseCsv("Name\0")).toThrow(CsvParseError)
    expect(() => parseCsv('Name\n"open')).toThrow(/closing quote/)
    expect(() => parseCsv('Name\nval"ue')).toThrow(/middle/)
    expect(() => parseCsv('"Name" extra\nA')).toThrow(/extra characters/)
  })

  it("requires the exact header set in any order", () => {
    const reversed = [...COMPANY_HEADERS].reverse()
    const values = Object.fromEntries(companyRow({ "Company Name": "Acme" }).map((cell, index) => [COMPANY_HEADERS[index], cell]))
    const records = rowsToRecords([reversed, reversed.map((header) => values[header] ?? "")], COMPANY_HEADERS)
    expect(records.records[0]?.values["Company Name"]).toBe("Acme")

    expect(() => rowsToRecords([[...COMPANY_HEADERS, "Owner"]], COMPANY_HEADERS)).toThrow(/Unknown headers: Owner/)
    expect(() => rowsToRecords([COMPANY_HEADERS.slice(1)], COMPANY_HEADERS)).toThrow(/Missing headers: Company Name/)
    expect(() => rowsToRecords([[...COMPANY_HEADERS, "Company Name"]], COMPANY_HEADERS)).toThrow(/Duplicate headers/)
    expect(() => rowsToRecords([[...COMPANY_HEADERS.slice(0, -1), ""]], COMPANY_HEADERS)).toThrow(/empty column/)
    expect(() =>
      rowsToRecords([[...COMPANY_HEADERS], [...companyRow({ "Company Name": "Acme" }), "extra"]], COMPANY_HEADERS),
    ).toThrow(/more values than headers/)
  })

  it("skips fully empty data rows and pads short rows", () => {
    const records = rowsToRecords(
      [[...COMPANY_HEADERS], companyRow(), ["Acme"]],
      COMPANY_HEADERS,
    ).records
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ row: 3, values: { "Company Name": "Acme", Notes: "" } })
  })
})

describe("xlsx parsing", () => {
  it("reads one worksheet and keeps header order flexible", async () => {
    const template = await templateWorkbook("companies")
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(template as unknown as ExcelJS.Buffer)
    expect(workbook.worksheets).toHaveLength(1)
    const sheet = workbook.worksheets[0]
    expect(sheet?.name).toBe("Companies")
    sheet?.addRow(companyRow({ "Company Name": "Acme", Size: "large", "Follow-up Date": "2026-05-01" }))
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
    const records = await parseXlsx(new Uint8Array(bytes), "companies")
    expect(records).toEqual([
      expect.objectContaining({
        row: 2,
        values: expect.objectContaining({
          "Company Name": "Acme",
          Size: "large",
          "Follow-up Date": "2026-05-01",
        }),
      }),
    ])
  })

  it("rejects extra worksheets and formula cells", async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet("Companies")
    workbook.addWorksheet("Other")
    const extra = new Uint8Array(await workbook.xlsx.writeBuffer())
    await expect(parseXlsx(extra, "companies")).rejects.toThrow(/exactly one worksheet/)

    const formulaBook = new ExcelJS.Workbook()
    const sheet = formulaBook.addWorksheet("Companies")
    sheet.addRow([...COMPANY_HEADERS])
    const row = sheet.addRow(companyRow({ "Company Name": "Acme" }))
    row.getCell(1).value = { formula: 'HYPERLINK("https://evil.example")', result: "Acme" }
    const bytes = new Uint8Array(await formulaBook.xlsx.writeBuffer())
    await expect(parseXlsx(bytes, "companies")).rejects.toThrow(/formulas are not allowed/)
  })
})

describe("row validation", () => {
  it("requires names and rejects bad enums, dates, urls, and salary ranges", () => {
    const missing = reviewCompanies(companyRecords([companyRow({ Size: "medium" })]), [])
    expect(missing.errors[0]?.messages.join(" ")).toMatch(/Company Name is required/)
    expect(missing.blocked).toBe(true)
    expect(missing.companies).toEqual([])
    expect(canCommit(missing)).toBe(false)

    const invalid = reviewCompanies(
      companyRecords([
        companyRow({
          "Company Name": "Acme",
          Size: "huge",
          "Website URL": "ftp://files.example",
          "Follow-up Date": "2026-02-31",
        }),
      ]),
      [],
    )
    const text = invalid.errors[0]?.messages.join(" ")
    expect(text).toMatch(/Size/)
    expect(text).toMatch(/http/)
    expect(text).toMatch(/YYYY-MM-DD/)
    expect(isRealIsoDate("2026-02-31")).toBe(false)
    expect(isRealIsoDate("2026-02-28")).toBe(true)

    const salary = reviewApplications(
      applicationRecords([
        applicationRow({
          "Company Name": "Acme",
          "Job Title": "Engineer",
          "Salary Min": "20",
          "Salary Max": "10",
          "Salary Currency": "us",
          Status: "hired",
        }),
      ]),
      { companies: [], applications: [] },
    )
    const salaryText = salary.errors[0]?.messages.join(" ")
    expect(salaryText).toMatch(/Salary Currency/)
    expect(salaryText).toMatch(/Status/)
    expect(salaryText).toMatch(/Salary Max/)
    expect(salary.applications).toEqual([])
  })

  it("keeps a valid earlier row out of the insert when a later row is invalid", () => {
    const review = reviewCompanies(
      companyRecords([
        companyRow({ "Company Name": "Acme" }),
        companyRow({ "Company Name": "Beta", Size: "nope" }),
      ]),
      [],
    )
    expect(review.decisions).toHaveLength(1)
    expect(review.companies).toEqual([])
    expect(review.ready).toBe(0)
    expect(canCommit(review)).toBe(false)
  })
})

describe("duplicates", () => {
  it("skips company names that already exist or repeat in the file", () => {
    const review = reviewCompanies(
      companyRecords([
        companyRow({ "Company Name": "  acme   corp " }),
        companyRow({ "Company Name": "Acme Corp" }),
        companyRow({ "Company Name": "New Co" }),
      ]),
      ["Acme Corp"],
    )
    expect(review.decisions.map((decision) => decision.reason)).toEqual([
      "This company is already in your account.",
      "This company name is repeated in the file.",
      "Will be added.",
    ])
    expect(review.companies.map((row) => row["Company Name"])).toEqual(["New Co"])
    expect(canCommit(review)).toBe(true)
  })

  it("matches applications on company, title, and normalized url without overwriting", () => {
    const existing = [
      {
        companyName: "Acme",
        jobTitle: "Engineer",
        jobUrl: "https://jobs.example/role/",
      },
    ]
    const review = reviewApplications(
      applicationRecords([
        applicationRow({
          "Company Name": "acme",
          "Job Title": "Engineer",
          "Job URL": "https://jobs.example/role",
        }),
        applicationRow({
          "Company Name": "Acme",
          "Job Title": " Engineer ",
          "Job URL": "https://jobs.example/role/",
        }),
        applicationRow({
          "Company Name": "Acme",
          "Job Title": "Engineer",
          "Job URL": "https://jobs.example/other",
        }),
        applicationRow({
          "Company Name": "Acme",
          "Job Title": "Engineer",
          "Job URL": "https://jobs.example/other",
        }),
        applicationRow({
          "Company Name": "Brand New",
          "Job Title": "Designer",
        }),
      ]),
      { companies: ["Acme"], applications: existing },
    )
    expect(review.decisions.map((decision) => decision.decision)).toEqual([
      "skip",
      "skip",
      "import",
      "skip",
      "import",
    ])
    expect(review.decisions[0]?.reason).toMatch(/already in your account/)
    expect(review.decisions[1]?.reason).toMatch(/repeated in the file/)
    expect(review.decisions[3]?.reason).toMatch(/repeated in the file/)
    expect(review.decisions[4]?.reason).toMatch(/company will be created/)
    expect(review.companiesToCreate).toBe(1)
    expect(review.applications).toHaveLength(2)
    expect(
      applicationDuplicateKey({ companyName: "Acme", jobTitle: "Engineer", jobUrl: "" }),
    ).not.toBe(
      applicationDuplicateKey({
        companyName: "Acme",
        jobTitle: "Engineer",
        jobUrl: "https://jobs.example/role",
      }),
    )
  })

  it("does not treat another user's company name as a duplicate", () => {
    const rows = [
      { userId: "user-a", name: "Mine" },
      { userId: "user-b", name: "Secret" },
    ]
    const review = reviewCompanies(
      companyRecords([companyRow({ "Company Name": "Secret" })]),
      namesForUser(rows, "user-a"),
    )
    expect(review.ready).toBe(1)
    expect(namesForUser(rows, "user-b")).toEqual(["Secret"])
  })
})

describe("csv export", () => {
  it("escapes commas, quotes, and newlines and neutralizes formulas", () => {
    const csv = companiesToCsv([
      {
        ...company,
        name: '=HYPERLINK("https://evil.example")',
        reference: "+cmd",
        industry: "-1",
      },
    ])
    expect(csv.startsWith(COMPANY_HEADERS.join(","))).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"")"`)
    expect(csv).toContain("'+cmd")
    expect(csv).toContain("'-1")
    expect(companiesToCsv([{ ...company, location: "@sum" }])).toContain("'@sum")
    expect(csv).toContain('"Austin, TX"')
    expect(csv).toContain('"Line one\nLine two"')
    expect(neutralizeSpreadsheetFormula("=1+1")).toBe("'=1+1")
    expect(neutralizeSpreadsheetFormula("Northwind")).toBe("Northwind")
  })

  it("round-trips a normal export through the companies and applications importers", () => {
    const companyReview = reviewCompanies(
      rowsToRecords(parseCsv(companiesToCsv([company])), headersFor("companies")).records,
      [],
    )
    expect(companyReview.companies[0]).toMatchObject({
      "Company Name": "Northwind",
      Size: "medium",
      Location: "Austin, TX",
      Notes: "Line one\nLine two",
      "Follow-up Date": "2026-04-01",
      "Website URL": "https://northwind.example",
    })

    const applicationReview = reviewApplications(
      rowsToRecords(parseCsv(applicationsToCsv([application])), headersFor("applications")).records,
      { companies: ["Northwind"], applications: [] },
    )
    expect(applicationReview.applications[0]).toMatchObject({
      "Company Name": "Northwind",
      "Job Title": "Engineer",
      "Salary Min": "100000",
      "Salary Max": "140000.5",
      Status: "applied",
      "Applied Date": "2026-03-15",
    })
    expect(canCommit(applicationReview)).toBe(true)
  })
})

describe("limits and database safety", () => {
  it("rejects oversized files and too many rows", () => {
    expect(rejectImportFile("companies.txt", 10)).toMatch(/csv or \.xlsx/)
    expect(rejectImportFile("companies.csv", 0)).toMatch(/empty/)
    expect(rejectImportFile("companies.xlsx", MAX_IMPORT_BYTES + 1)).toMatch(/1 MB/)
    expect(rejectImportFile("companies.csv", MAX_IMPORT_BYTES)).toBeNull()

    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) =>
      companyRow({ "Company Name": `Company ${index}` }),
    )
    const review = reviewCompanies(companyRecords(rows), [])
    expect(review.fileError).toMatch(/500/)
    expect(review.companies).toEqual([])
    expect(canCommit(review)).toBe(false)
  })

  it("keeps import execution on the signed-in user inside one transaction", () => {
    const sql = readFileSync(
      "supabase/migrations/20261019204500_import_companies_and_applications.sql",
      "utf8",
    )
    expect(sql).toContain("security invoker")
    expect(sql.toLowerCase()).not.toContain("security definer")
    expect(sql).toContain("if auth.uid() is null")
    expect(sql).toContain("pg_advisory_xact_lock")
    expect(sql).toContain("where user_id = auth.uid()")
    expect(sql).toContain("company_uuid := null;")
    expect(sql).toContain("revoke all on function public.import_companies(jsonb) from public, anon")
    expect(sql).toContain("revoke all on function public.import_applications(jsonb) from public, anon")
    expect(sql).toContain("grant execute on function public.import_companies(jsonb) to authenticated")
    expect(sql).toContain("grant execute on function public.import_applications(jsonb) to authenticated")
    expect(sql.toLowerCase()).not.toContain("service_role")
    expect(sql).not.toMatch(/insert into public\.companies \([^)]*user_id/i)
    expect(sql).not.toMatch(/insert into public\.applications \([^)]*user_id/i)
    expect(sql.toLowerCase()).not.toContain("commit;")

    const actions = readFileSync("src/lib/import/actions.ts", "utf8")
    expect(actions).toContain("await requireUser()")
    expect(actions).toContain('.eq("user_id", userId)')
    expect(actions).toContain('supabase.rpc(')
    const companiesExport = readFileSync("src/app/export/companies/route.ts", "utf8")
    const applicationsExport = readFileSync("src/app/export/applications/route.ts", "utf8")
    const templateExport = readFileSync("src/app/export/templates/[kind]/route.ts", "utf8")
    expect(companiesExport).toContain("await requireUser()")
    expect(applicationsExport).toContain("await requireUser()")
    expect(templateExport).toContain("await requireUser()")
  })
})
