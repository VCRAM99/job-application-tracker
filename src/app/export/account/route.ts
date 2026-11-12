import { buildAccountExport } from "@/lib/account/export"

/** Settings → Your data: every row the signed-in user owns, as one JSON file. */
export async function GET() {
  const data = await buildAccountExport()
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-tracker-export-${data.exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  })
}
