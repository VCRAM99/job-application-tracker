import "server-only"

import { completeAnthropic, type AnthropicLike } from "@/lib/ai/providers/anthropic"
import { completeGemini, type GeminiLike } from "@/lib/ai/providers/google"
import { completeOpenAI, type OpenAILike } from "@/lib/ai/providers/openai"
import { AiRequestError, type ProviderId, type StructuredRequest, type StructuredResponse } from "@/lib/ai/types"

export type ProviderClients = {
  openai?: OpenAILike
  anthropic?: AnthropicLike
  google?: GeminiLike
}

export async function completeWithProvider(
  provider: ProviderId,
  request: StructuredRequest,
  clients: ProviderClients = {},
): Promise<StructuredResponse> {
  if (provider === "openai") return completeOpenAI(request, clients.openai)
  if (provider === "anthropic") return completeAnthropic(request, clients.anthropic)
  if (provider === "google") return completeGemini(request, clients.google)
  throw new AiRequestError("unsupported_model")
}
