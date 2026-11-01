import { authorizeScheduler } from "@/lib/jobs/scheduler-auth"
import { runScheduler } from "@/lib/jobs/run-scheduler"

// Ingestion fetches each approved board in turn; leave room for slow providers.
export const maxDuration = 300

async function handle(request: Request) {
  const decision = authorizeScheduler(request.headers.get("authorization"))
  if (!decision.ok) {
    return Response.json({ status: "inactive", reason: decision.reason }, { status: decision.status })
  }
  const result = await runScheduler(new Date())
  return Response.json(result.body, { status: result.status })
}

/** Vercel Cron calls GET with `Authorization: Bearer ${CRON_SECRET}`. */
export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
