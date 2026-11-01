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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type JobsAllowlist = { mode: "everyone" } | { mode: "listed"; ids: ReadonlySet<string> } | { mode: "nobody" }

/**
 * JOB_RECOMMENDATIONS_ALLOWED_USER_IDS is a comma-separated list of user ids.
 * Unset or blank keeps the existing behavior. A malformed entry closes the
 * section to everyone rather than guessing which ids were meant.
 */
export function recommendedJobsAllowlist(env: Env = process.env): JobsAllowlist {
  const raw = env.JOB_RECOMMENDATIONS_ALLOWED_USER_IDS?.trim() ?? ""
  if (!raw) return { mode: "everyone" }
  const ids = raw.split(",").map((item) => item.trim()).filter(Boolean)
  if (ids.length === 0 || ids.some((id) => !UUID.test(id))) return { mode: "nobody" }
  return { mode: "listed", ids: new Set(ids.map((id) => id.toLowerCase())) }
}

export function recommendedJobsAllowedFor(userId: string | null, env: Env = process.env): boolean {
  if (!recommendedJobsEnabled(env)) return false
  const allowlist = recommendedJobsAllowlist(env)
  if (allowlist.mode === "everyone") return true
  if (allowlist.mode === "nobody" || !userId) return false
  return allowlist.ids.has(userId.toLowerCase())
}
