export const PROVIDERS = ["openai", "anthropic", "google"] as const
export type ProviderId = (typeof PROVIDERS)[number]

export const EXECUTION_MODES = ["managed", "byok", "local"] as const
export type ExecutionMode = (typeof EXECUTION_MODES)[number]

export const STORED_EXECUTION_MODES = ["managed", "byok"] as const
export type StoredExecutionMode = (typeof STORED_EXECUTION_MODES)[number]

export const AI_ERROR_CODES = [
  "features_disabled",
  "missing_credentials",
  "invalid_credentials",
  "encryption_unconfigured",
  "unsupported_model",
  "model_unavailable",
  "rate_limited",
  "provider_outage",
  "invalid_response",
  "context_limit",
  "quota_exceeded",
  "transient",
  "managed_unconfigured",
  "accounting_unconfigured",
  "mode_unavailable",
  "mode_mismatch",
  "in_progress",
  "not_configured",
] as const

export type AiErrorCode = (typeof AI_ERROR_CODES)[number]

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  features_disabled: "AI features are turned off on this server.",
  missing_credentials: "Save a key for the selected provider before running AI.",
  invalid_credentials: "The provider rejected the saved key.",
  encryption_unconfigured: "The server cannot store provider keys until AI_CREDENTIALS_KEY is set.",
  unsupported_model: "That model is not available for structured career extraction.",
  model_unavailable: "The provider says the selected model is not available. Choose another model in AI settings, or ask the operator to update the default.",
  rate_limited: "The provider is rate limiting requests. Wait a moment and try again.",
  provider_outage: "The provider is unavailable. Try again later.",
  invalid_response: "The model response did not match the expected career facts. Nothing was saved as verified.",
  context_limit: "The resume is too large for the selected model.",
  quota_exceeded: "The managed AI allowance for this month is used up.",
  transient: "The provider did not complete the request. Try again.",
  managed_unconfigured: "Managed AI is not configured. Choose Bring Your Own Key, or ask the operator to set the allowance.",
  accounting_unconfigured: "AI accounting is not configured on this server.",
  mode_unavailable: "Local desktop execution is not available in this version.",
  mode_mismatch: "The request does not match the execution mode saved in AI settings.",
  in_progress: "This extraction is already running. Wait a moment and try again.",
  not_configured: "Choose a provider and model in AI settings first.",
}

export type TokenUsage = {
  inputTokens: number | null
  outputTokens: number | null
}

export type StructuredRequest = {
  apiKey: string
  model: string
  system: string
  user: string
  schemaName: string
  jsonSchema: Record<string, unknown>
  /** Ask for less reasoning where the model supports it. Adapters that cannot honor it ignore it. */
  thinking?: "low"
}

export type StructuredResponse = TokenUsage & {
  text: string
  finishReason: string | null
}

export class AiRequestError extends Error {
  readonly code: AiErrorCode
  readonly retryable: boolean

  constructor(code: AiErrorCode, options?: { message?: string; retryable?: boolean }) {
    super(options?.message ?? AI_ERROR_MESSAGES[code])
    this.name = "AiRequestError"
    this.code = code
    this.retryable = options?.retryable ?? false
  }
}

export function isProvider(value: string): value is ProviderId {
  return (PROVIDERS as readonly string[]).includes(value)
}

export function isStoredMode(value: string): value is StoredExecutionMode {
  return (STORED_EXECUTION_MODES as readonly string[]).includes(value)
}
