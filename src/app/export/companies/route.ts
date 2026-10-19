import { requireUser } from "@/lib/auth/session"
import { csvResponse } from "@/lib/import/csv-response"
import { companiesToCsv } from "@/lib/import/export-table"
import { listCompanies } from "@/lib/records/data"

export async function GET() {
  await requireUser()
  const result = await listCompanies()
  if (!result.ok) {
    return new Response("Companies could not be exported.", { status: 500 })
  }
  return csvResponse(companiesToCsv(result.data), "companies.csv")
}
