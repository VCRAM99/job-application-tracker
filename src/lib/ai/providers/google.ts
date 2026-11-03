import "server-only"

import { GoogleGenAI, ThinkingLevel } from "@google/genai"

import { findModel, responseSchemaFor } from "@/lib/ai/models"
import { isOverloaded, mapProviderFailure, OVERLOAD_RETRY_DELAY_MS, PROVIDER_TIMEOUT_MS } from "@/lib/ai/provider-error"
import { AiRequestError, type StructuredRequest, type StructuredResponse } from "@/lib/ai/types"

export type GeminiResponse = {
  text?: string
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  candidates?: Array<{ finishReason?: string }>
}

export type GeminiLike = {
  models: {
    generateContent: (args: {
      model: string
      contents: string
      config: {
        systemInstruction: string
        responseMimeType: string
        responseJsonSchema: Record<string, unknown>
        thinkingConfig?: { thinkingLevel: ThinkingLevel }
      }
    }) => Promise<GeminiResponse>
  }
}

export function createGeminiClient(apiKey: string): GeminiLike {
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: PROVIDER_TIMEOUT_MS } })
}

export async function completeGemini(
  request: StructuredRequest,
  client: GeminiLike = createGeminiClient(request.apiKey),
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<StructuredResponse> {
  const call = async (model: string) => {
    const lowThinking = request.thinking === "low" && findModel("google", model)?.thinkingLevel
    return client.models.generateContent({
      model,
      contents: request.user,
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        responseJsonSchema: responseSchemaFor("google", model, request.jsonSchema),
        ...(lowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    })
  }
  try {
    let response: GeminiResponse
    let modelUsed = request.model
    try {
      response = await call(request.model)
    } catch (error) {
      // One bounded fallback, only when the model is overloaded (503/529). Every other failure
      // (bad key, unavailable model, rate limit) is reported as is.
      const fallback = findModel("google", request.model)?.overloadFallback
      if (!fallback || !isOverloaded(error)) throw error
      await wait(OVERLOAD_RETRY_DELAY_MS)
      modelUsed = fallback
      response = await call(fallback)
    }
    if (!response.text) throw new AiRequestError("invalid_response")
    const finishReason = response.candidates?.[0]?.finishReason ?? null
    if (finishReason === "MAX_TOKENS") throw new AiRequestError("context_limit")
    return {
      text: response.text,
      finishReason,
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
      modelUsed,
    }
  } catch (error) {
    throw mapProviderFailure(error)
  }
}
