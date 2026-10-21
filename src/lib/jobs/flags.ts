import "server-only"

type Env = Record<string, string | undefined>

function explicitFlag(value: string | undefined): boolean | null {
  const flag = value?.trim().toLowerCase()
  if (flag === "1" || flag === "true" || flag === "yes") return true
  if (flag === "0" || flag === "false" || flag === "no") return false
  return null
}

/** Recommended Jobs UI. Off in production unless JOB_RECOMMENDATIONS_ENABLED is true. */
export function recommendedJobsEnabled(env: Env = process.env): boolean {
  const flag = explicitFlag(env.JOB_RECOMMENDATIONS_ENABLED)
  if (flag !== null) return flag
  if (env.VERCEL_ENV === "production") return false
  return env.NODE_ENV !== "production"
}

/** Live calls to Greenhouse, Lever, or Ashby. Off unless explicitly enabled. */
export function jobIngestionEnabled(env: Env = process.env): boolean {
  return explicitFlag(env.JOB_INGESTION_ENABLED) === true
}

/** Scheduled refresh and alert runs. Off unless explicitly enabled. */
export function jobRefreshEnabled(env: Env = process.env): boolean {
  return explicitFlag(env.JOB_REFRESH_ENABLED) === true
}

/**
 * Email delivery stays off until an operator sets the flag and a from-address.
 * The sender itself remains inactive until a provider is approved.
 */
export function jobEmailDeliveryEnabled(env: Env = process.env): boolean {
  return explicitFlag(env.JOB_EMAIL_DELIVERY_ENABLED) === true && Boolean(env.JOB_EMAIL_FROM?.trim())
}
