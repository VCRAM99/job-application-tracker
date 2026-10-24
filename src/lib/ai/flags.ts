import "server-only"

type Env = Record<string, string | undefined>

export function aiFeaturesEnabled(env: Env = process.env): boolean {
  const flag = env.AI_FEATURES_ENABLED?.trim().toLowerCase()
  if (flag === "1" || flag === "true" || flag === "yes") return true
  if (flag === "0" || flag === "false" || flag === "no") return false
  if (env.VERCEL_ENV === "production") return false
  return env.NODE_ENV !== "production"
}

/** Job fit analysis. Explicit "true" only, and only while career AI is enabled. */
export function jobAnalysisEnabled(env: Env = process.env): boolean {
  return env.JOB_ANALYSIS_ENABLED?.trim().toLowerCase() === "true" && aiFeaturesEnabled(env)
}

/**
 * Local stand-in for provider calls. Never active in production.
 * A missing or any other value keeps the real adapters.
 */
export function jobAnalysisMockProvider(env: Env = process.env): boolean {
  if (env.JOB_ANALYSIS_MOCK_PROVIDER?.trim().toLowerCase() !== "true") return false
  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") return false
  return true
}

export function managedAllowance(env: Env = process.env): {
  enabled: boolean
  requestLimit: number
  tokenLimit: number
} {
  const requests = Number(env.AI_MANAGED_MONTHLY_REQUEST_LIMIT)
  const tokens = Number(env.AI_MANAGED_MONTHLY_TOKEN_LIMIT)
  const enabled =
    env.AI_MANAGED_ENABLED?.trim().toLowerCase() === "true" &&
    Number.isInteger(requests) &&
    requests > 0 &&
    Number.isInteger(tokens) &&
    tokens > 0
  return {
    enabled,
    requestLimit: enabled ? requests : 0,
    tokenLimit: enabled ? tokens : 0,
  }
}

export function platformKeyConfigured(
  provider: "openai" | "anthropic" | "google",
  env: Env = process.env,
): boolean {
  const name =
    provider === "openai"
      ? "AI_PLATFORM_OPENAI_API_KEY"
      : provider === "anthropic"
        ? "AI_PLATFORM_ANTHROPIC_API_KEY"
        : "AI_PLATFORM_GOOGLE_API_KEY"
  return Boolean(env[name]?.trim())
}

export function readPlatformKey(
  provider: "openai" | "anthropic" | "google",
  env: Env = process.env,
): string | null {
  const name =
    provider === "openai"
      ? "AI_PLATFORM_OPENAI_API_KEY"
      : provider === "anthropic"
        ? "AI_PLATFORM_ANTHROPIC_API_KEY"
        : "AI_PLATFORM_GOOGLE_API_KEY"
  const value = env[name]?.trim()
  return value ? value : null
}
