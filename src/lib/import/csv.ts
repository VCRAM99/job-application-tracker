export class CsvParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CsvParseError"
  }
}

export function parseCsv(input: string): string[][] {
  let text = input
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  if (text.includes("\0")) {
    throw new CsvParseError("The file is not a CSV text file.")
  }

  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  let cellStartedWithQuote = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
          continue
        }
        inQuotes = false
        continue
      }
      cell += char ?? ""
      continue
    }

    if (char === '"') {
      if (cell.length > 0) {
        throw new CsvParseError("A quote appears in the middle of an unquoted value.")
      }
      inQuotes = true
      cellStartedWithQuote = true
      continue
    }
    if (char === ",") {
      row.push(cell)
      cell = ""
      cellStartedWithQuote = false
      continue
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      cellStartedWithQuote = false
      continue
    }
    if (cellStartedWithQuote) {
      throw new CsvParseError("A quoted value has extra characters after the closing quote.")
    }
    cell += char ?? ""
  }

  if (inQuotes) throw new CsvParseError("A quoted value is missing its closing quote.")
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  while (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last && last.length === 1 && last[0] === "") rows.pop()
    else break
  }
  return rows
}

export function rowsToRecords(
  rows: string[][],
  expectedHeaders: readonly string[],
): { headers: string[]; records: Array<{ row: number; values: Record<string, string> }> } {
  const headerRow = rows[0]
  if (!headerRow || headerRow.every((cell) => cell.trim() === "")) {
    throw new CsvParseError("The file needs a header row.")
  }
  const headers = headerRow.map((cell) => cell.trim())
  const expected = new Set(expectedHeaders)
  const seen = new Set<string>()
  const unknown = headers.filter((header) => header.length > 0 && !expected.has(header))
  const duplicates = headers.filter((header) => {
    if (!header) return false
    if (seen.has(header)) return true
    seen.add(header)
    return false
  })
  const missing = expectedHeaders.filter((header) => !headers.includes(header))
  if (unknown.length > 0 || missing.length > 0 || duplicates.length > 0 || headers.some((header) => header.length === 0)) {
    const parts: string[] = []
    if (missing.length > 0) parts.push(`Missing headers: ${missing.join(", ")}.`)
    if (unknown.length > 0) parts.push(`Unknown headers: ${unknown.join(", ")}.`)
    if (duplicates.length > 0) parts.push(`Duplicate headers: ${duplicates.join(", ")}.`)
    if (headers.some((header) => header.length === 0)) parts.push("The header row has an empty column.")
    throw new CsvParseError(parts.join(" "))
  }

  const records: Array<{ row: number; values: Record<string, string> }> = []
  rows.slice(1).forEach((cells, index) => {
    if (cells.every((cell) => cell.trim() === "")) return
    if (cells.length > headers.length) {
      throw new CsvParseError(`Row ${index + 2} has more values than headers.`)
    }
    const values: Record<string, string> = {}
    headers.forEach((header, cellIndex) => {
      values[header] = cells[cellIndex] ?? ""
    })
    records.push({ row: index + 2, values })
  })
  return { headers, records }
}
