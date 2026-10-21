import "server-only"

import Anthropic from "@anthropic-ai/sdk"

import { mapProviderFailure } from "@/lib/ai/provider-error"
import { AiRequestError, type StructuredRequest, type StructuredResponse } from "@/lib/ai/types"

type AnthropicMessage = {
  content: Array<{ type: string; text?: string }>
  stop_reason?: string | null
  usage?: { input_tokens?: number; output_tokens?: number }
}

export type AnthropicLike = {
  messages: {
    create: (body: Anthropic.MessageCreateParamsNonStreaming) => Promise<AnthropicMessage>
  }
}

export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey })
}

export async function completeAnthropic(
  request: StructuredRequest,
  client: AnthropicLike = createAnthropicClient(request.apiKey),
): Promise<StructuredResponse> {
  try {
    const response = await client.messages.create({
      model: request.model,
      max_tokens: 4096,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
      output_config: {
        format: {
          type: "json_schema",
          schema: request.jsonSchema,
        },
      },
    })
    const text = response.content.find((block) => block.type === "text")?.text
    if (!text) throw new AiRequestError("invalid_response")
    if (response.stop_reason === "max_tokens") throw new AiRequestError("context_limit")
    return {
      text,
      finishReason: response.stop_reason ?? null,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    }
  } catch (error) {
    throw mapProviderFailure(error)
  }
}
