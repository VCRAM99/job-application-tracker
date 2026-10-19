import { requireUser } from "@/lib/auth/session"
import { toCsv, headersFor, type ImportKind } from "@/lib/import/format"
import { templateWorkbook } from "@/lib/import/xlsx"
import { csvResponse } from "@/lib/import/csv-response"

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  await requireUser()
  const { kind: kindParam } = await context.params
  const kind: ImportKind | null =
    kindParam === "companies" || kindParam === "applications" ? kindParam : null
  if (!kind) return new Response("Unknown template.", { status: 404 })

  const format = new URL(request.url).searchParams.get("format")
  if (format === "csv") {
    return csvResponse(toCsv(headersFor(kind), []), `${kind}.csv`)
  }
  if (format === "xlsx") {
    const body = await templateWorkbook(kind)
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${kind}.xlsx"`,
        "Cache-Control": "no-store",
      },
    })
  }
  return new Response("Use format=csv or format=xlsx.", { status: 400 })
}
