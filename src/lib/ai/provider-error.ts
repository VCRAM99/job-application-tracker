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
