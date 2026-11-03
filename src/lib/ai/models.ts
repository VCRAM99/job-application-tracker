import { AiRequestError, type ProviderId } from "@/lib/ai/types"

export type ModelCapability = {
  provider: ProviderId
  id: string
  label: string
  structured: true
  /** Accepts a Gemini thinking level on generateContent. */
  thinkingLevel?: true
  /** Returns HTTP 400 when a response schema has maxItems. Zod still enforces the caps. */
  rejectsMaxItems?: true
  /** Still accepted for saved settings, but not offered in the picker (deprecated or unverified). */
  legacy?: true
  /** Tried once, only when this model is overloaded (HTTP 503/529). */
  overloadFallback?: string
}

/**
 * Curated models with structured-output support, checked against each provider's model docs
 * on 2026-11-02 (docs/ai.md lists the sources). The first non-legacy model per provider is
 * the default. Update this list when a provider retires a model; prices are not stored here.
 * - Google: gemini-3.5-flash-lite (stable Flash-Lite) by default, falling back once to
 *   gemini-3.8-flash on overload. The 2.5 models are deprecated (shut down 2026-12-01) and
 *   limited to existing users, so they are legacy.
 * - Anthropic: claude-haiku-5-5 by default. claude-haiku-4-5 is only an SDK alias of the dated
 *   claude-haiku-4-5-20251001, which may retire any time after 2026-10-15, so it is legacy.
 * - OpenAI: gpt-6-luna is the documented efficient model. gpt-5.4-mini and gpt-5.4 do not
 *   appear on the current models page, so they are legacy (not live-verified).
 */
export const MODEL_REGISTRY: readonly ModelCapability[] = [
  { provider: "openai", id: "gpt-6-luna", label: "GPT-6 Luna", structured: true },
  { provider: "openai", id: "gpt-6.1-terra", label: "GPT-6.1 Terra", structured: true },
  { provider: "openai", id: "gpt-5.4-mini", label: "GPT-5.4 mini", structured: true, legacy: true },
  { provider: "openai", id: "gpt-5.4", label: "GPT-5.4", structured: true, legacy: true },
  { provider: "anthropic", id: "claude-haiku-5-5", label: "Claude Haiku 5.5", structured: true },
  { provider: "anthropic", id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", structured: true },
  { provider: "anthropic", id: "claude-sonnet-5", label: "Claude Sonnet 5", structured: true },
  { provider: "anthropic", id: "claude-haiku-4-5", label: "Claude Haiku 4.5", structured: true, legacy: true },
  {
    provider: "google",
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    structured: true,
    thinkingLevel: true,
    rejectsMaxItems: true,
    overloadFallback: "gemini-3.8-flash",
  },
  { provider: "google", id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", structured: true, thinkingLevel: true },
  { provider: "google", id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", structured: true, legacy: true },
  { provider: "google", id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", structured: true, legacy: true },
]

/** Models offered in the settings picker for a provider, default first. */
export function modelsFor(provider: ProviderId): readonly ModelCapability[] {
  return MODEL_REGISTRY.filter((model) => model.provider === provider && !model.legacy)
}

export function defaultModelFor(provider: ProviderId): string {
  return modelsFor(provider)[0]!.id
}

export function findModel(provider: string, modelId: string): ModelCapability | null {
  return (
    MODEL_REGISTRY.find((model) => model.provider === provider && model.id === modelId) ?? null
  )
}

export function assertSupportedModel(provider: string, modelId: string): ModelCapability {
  const model = findModel(provider, modelId)
  if (!model?.structured) {
    throw new AiRequestError("unsupported_model")
  }
  return model
}

/** The response schema to send to a model, without keywords it rejects. */
export function responseSchemaFor(provider: ProviderId, model: string, schema: Record<string, unknown>): Record<string, unknown> {
  if (!findModel(provider, model)?.rejectsMaxItems) return schema
  return withoutKey(schema, "maxItems") as Record<string, unknown>
}

function withoutKey(value: unknown, key: string): unknown {
  if (Array.isArray(value)) return value.map((item) => withoutKey(item, key))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([name]) => name !== key)
      .map(([name, item]) => [name, withoutKey(item, key)]),
  )
}
