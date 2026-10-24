import { authorizeScheduler } from "@/lib/jobs/scheduler-auth"
import { runScheduledAlerts } from "@/lib/jobs/run-alerts"

export async function POST(request: Request) {
  const decision = authorizeScheduler(request.headers.get("authorization"))
  if (!decision.ok) {
    return Response.json({ status: "inactive", reason: decision.reason }, { status: decision.status })
  }
  const result = await runScheduledAlerts(new Date())
  return Response.json(result.body, { status: result.status })
}
