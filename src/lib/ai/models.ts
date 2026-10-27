import { AiRequestError, type ProviderId } from "@/lib/ai/types"

export type ModelCapability = {
  provider: ProviderId
  id: string
  label: string
  structured: true
  /** Accepts a Gemini thinking level on generateContent. */
  thinkingLevel?: true
}

/**
 * Curated models with structured-output support. Update this list when a
 * provider retires a model. Prices are intentionally not stored here.
 * The first model per provider is the settings form default.
 * Gemini 2.5 models stay for accounts that already use them. Google no
 * longer serves them to new users, so they are not a default anywhere.
 */
export const MODEL_REGISTRY: readonly ModelCapability[] = [
  { provider: "openai", id: "gpt-5.4-mini", label: "GPT-5.4 mini", structured: true },
  { provider: "openai", id: "gpt-5.4", label: "GPT-5.4", structured: true },
  { provider: "anthropic", id: "claude-sonnet-5", label: "Claude Sonnet 5", structured: true },
  { provider: "anthropic", id: "claude-haiku-5-5", label: "Claude Haiku 5.5", structured: true },
  { provider: "anthropic", id: "claude-haiku-4-5", label: "Claude Haiku 4.5", structured: true },
  { provider: "google", id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", structured: true, thinkingLevel: true },
  { provider: "google", id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", structured: true },
  { provider: "google", id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", structured: true },
]

export function modelsFor(provider: ProviderId): readonly ModelCapability[] {
  return MODEL_REGISTRY.filter((model) => model.provider === provider)
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
