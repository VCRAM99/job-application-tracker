import "server-only"

import OpenAI from "openai"

import { mapProviderFailure } from "@/lib/ai/provider-error"
import { AiRequestError, type StructuredRequest, type StructuredResponse } from "@/lib/ai/types"

export type OpenAICompletion = {
  choices: Array<{
    message?: { content?: string | null }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null
}

export type OpenAILike = {
  chat: {
    completions: {
      create: (
        body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      ) => Promise<OpenAICompletion>
    }
  }
}

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey })
}

export async function completeOpenAI(
  request: StructuredRequest,
  client: OpenAILike = createOpenAIClient(request.apiKey),
): Promise<StructuredResponse> {
  try {
    const response = await client.chat.completions.create({
      model: request.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: request.jsonSchema,
        },
      },
    })
    const choice = response.choices[0]
    const text = choice?.message?.content
    if (!text) throw new AiRequestError("invalid_response")
    if (choice?.finish_reason === "length") throw new AiRequestError("context_limit")
    return {
      text,
      finishReason: choice?.finish_reason ?? null,
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
    }
  } catch (error) {
    throw mapProviderFailure(error)
  }
}
