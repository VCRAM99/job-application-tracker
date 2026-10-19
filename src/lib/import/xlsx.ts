import "server-only"

import ExcelJS from "exceljs"

import { CsvParseError, rowsToRecords } from "@/lib/import/csv"
import { headersFor, isRealIsoDate, type ImportKind } from "@/lib/import/format"

function excelDate(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  const day = String(value.getUTCDate()).padStart(2, "0")
  const formatted = `${year}-${month}-${day}`
  return isRealIsoDate(formatted) ? formatted : ""
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return ""
  if (value instanceof Date) return excelDate(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CsvParseError("A cell contains a number that cannot be imported.")
    const rounded = Math.round(value * 100) / 100
    if (Math.abs(value - rounded) > 0.001) {
      throw new CsvParseError("A number has more than two decimal places.")
    }
    return String(rounded)
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "object") {
    if ("formula" in value) {
      throw new CsvParseError("Spreadsheet formulas are not allowed. Enter the value as text.")
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("")
    }
    if ("text" in value && typeof value.text === "string") return value.text
    if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue)
  }
  return String(value)
}

export async function workbookFromRows(sheetName: string, headers: readonly string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  sheet.addRow([...headers])
  headers.forEach((_, index) => {
    sheet.getColumn(index + 1).numFmt = "@"
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function parseXlsx(
  bytes: Uint8Array,
  kind: ImportKind,
): Promise<Array<{ row: number; values: Record<string, string> }>> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer)
  } catch {
    throw new CsvParseError("The spreadsheet could not be read. Use the official .xlsx template.")
  }
  if (workbook.worksheets.length !== 1) {
    throw new CsvParseError("The spreadsheet must contain exactly one worksheet.")
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new CsvParseError("The spreadsheet must contain exactly one worksheet.")

  const headerCount = headersFor(kind).length
  const byNumber = new Map<number, string[]>()
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    const width = Math.max(headerCount, row.cellCount)
    for (let index = 1; index <= width; index += 1) {
      try {
        cells.push(cellText(row.getCell(index).value))
      } catch (error) {
        const message = error instanceof Error ? error.message : "A cell could not be read."
        throw new CsvParseError(`Row ${row.number}: ${message}`)
      }
    }
    while (cells.length > headerCount && cells[cells.length - 1] === "") cells.pop()
    byNumber.set(row.number, cells)
  })

  const lastRow = Math.max(0, ...byNumber.keys())
  if (!byNumber.has(1)) throw new CsvParseError("The file needs a header row.")
  const matrix: string[][] = []
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    matrix.push(byNumber.get(rowNumber) ?? [])
  }
  return rowsToRecords(matrix, headersFor(kind)).records
}

export async function templateWorkbook(kind: ImportKind): Promise<Buffer> {
  return workbookFromRows(kind === "companies" ? "Companies" : "Applications", headersFor(kind))
}
