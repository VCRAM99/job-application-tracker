import { AiRequestError, type AiErrorCode } from "@/lib/ai/types"

export function mapProviderFailure(error: unknown): AiRequestError {
  if (error instanceof AiRequestError) return error
  const status = readStatus(error)
  const raw = error instanceof Error ? error.message : ""
  const code = classify(status, raw)
  const retryable = code === "rate_limited" || code === "transient" || code === "provider_outage"
  return new AiRequestError(code, { retryable })
}

function classify(status: number | null, message: string): AiErrorCode {
  const text = message.toLowerCase()
  if (
    text.includes("context length") ||
    text.includes("context_length") ||
    text.includes("maximum context") ||
    text.includes("too many tokens") ||
    text.includes("token limit")
  ) {
    return "context_limit"
  }
  if (status === 401 || status === 403) return "invalid_credentials"
  if (status === 404) return "model_unavailable"
  if (
    text.includes("model_not_found") ||
    text.includes("no longer available") ||
    (text.includes("model") && (text.includes("not found") || text.includes("does not exist")))
  ) {
    return "model_unavailable"
  }
  if (status === 400) return "unsupported_model"
  if (status === 429) return "rate_limited"
  if (status === 408 || status === 409 || status === 529) return "transient"
  if (status != null && status >= 500) return "provider_outage"
  if (text.includes("timeout") || text.includes("timed out") || text.includes("network")) {
    return "transient"
  }
  return "provider_outage"
}

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null
  const status = (error as { status?: unknown }).status
  return typeof status === "number" ? status : null
}

/**
 * True only when the provider says it is overloaded right now: HTTP 503 or 529,
 * or an overload message with no status. A 404, 429, or other 5xx is not.
 */
export function isOverloaded(error: unknown): boolean {
  if (error instanceof AiRequestError) return false
  const status = readStatus(error)
  if (status != null) return status === 503 || status === 529
  const text = error instanceof Error ? error.message.toLowerCase() : ""
  return text.includes("overloaded") || text.includes("high demand")
}

export const OVERLOAD_RETRY_DELAY_MS = 2000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Calls once, and once more after a short jittered wait if the provider was overloaded. */
export async function withOverloadRetry<T>(
  call: () => Promise<T>,
  options: { wait?: (ms: number) => Promise<void>; delayMs?: number } = {},
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (!isOverloaded(error)) throw error
  }
  const delay = options.delayMs ?? OVERLOAD_RETRY_DELAY_MS
  await (options.wait ?? sleep)(delay + Math.floor(Math.random() * (delay / 2)))
  return call()
}
