import { requireUser } from "@/lib/auth/session"
import { applicationsToCsv } from "@/lib/import/export-table"
import { listApplications } from "@/lib/records/data"
import { csvResponse } from "@/lib/import/csv-response"

export async function GET() {
  await requireUser()
  const result = await listApplications()
  if (!result.ok) {
    return new Response("Applications could not be exported.", { status: 500 })
  }
  return csvResponse(applicationsToCsv(result.data), "applications.csv")
}
