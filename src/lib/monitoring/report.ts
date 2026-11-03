import "server-only"

/**
 * Reports an operational failure to Sentry by code only, when SENTRY_DSN is set; otherwise
 * nothing. Never pass user text, keys, or ids: `fields` are tags such as an error code,
 * provider, model, or stage, and are scrubbed again before sending.
 */
export type ReportKind = "ai_provider_error" | "scheduler_failure"

export function monitoringEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SENTRY_DSN?.trim())
}

export async function reportFailure(kind: ReportKind, fields: Record<string, string | number | null | undefined>): Promise<void> {
  if (!monitoringEnabled()) return
  try {
    const Sentry = await import("@sentry/nextjs")
    const tags = Object.fromEntries(
      Object.entries(fields)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value).slice(0, 64)]),
    )
    Sentry.captureMessage(kind, { level: "error", tags })
  } catch {
    // Monitoring must never break the request it reports on.
  }
}
