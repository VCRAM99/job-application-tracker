import "server-only"

import { GoogleGenAI, ThinkingLevel } from "@google/genai"

import { findModel, responseSchemaFor } from "@/lib/ai/models"
import { mapProviderFailure } from "@/lib/ai/provider-error"
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
  return new GoogleGenAI({ apiKey })
}

export async function completeGemini(
  request: StructuredRequest,
  client: GeminiLike = createGeminiClient(request.apiKey),
): Promise<StructuredResponse> {
  const lowThinking = request.thinking === "low" && findModel("google", request.model)?.thinkingLevel
  try {
    const response = await client.models.generateContent({
      model: request.model,
      contents: request.user,
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        responseJsonSchema: responseSchemaFor("google", request.model, request.jsonSchema),
        ...(lowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    })
    if (!response.text) throw new AiRequestError("invalid_response")
    const finishReason = response.candidates?.[0]?.finishReason ?? null
    if (finishReason === "MAX_TOKENS") throw new AiRequestError("context_limit")
    return {
      text: response.text,
      finishReason,
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
    }
  } catch (error) {
    throw mapProviderFailure(error)
  }
}
