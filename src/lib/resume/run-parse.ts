import "server-only"

import { generateStructured, type GatewayDeps } from "@/lib/ai/gateway"
import { completeWithProvider } from "@/lib/ai/providers"
import type { AiRun } from "@/lib/ai/run-context"
import type { StructuredRequest, StructuredResponse } from "@/lib/ai/types"
import { RESUME_CONTENT_JSON_SCHEMA, resumeContentSchema, type ResumeContent } from "@/lib/resume/content"
import { groundResume, PARSE_SYSTEM_PROMPT, parseUserMessage, type ParseDropped } from "@/lib/resume/parse"

export type ParseOutcome = { content: ResumeContent; dropped: ParseDropped }

/**
 * One structured call through the gateway: reservation, one JSON repair,
 * retry on retryable provider errors, then server grounding before persist.
 * The model's raw output is never stored or shown.
 */
export async function parseResumeText(input: {
  text: string
  run: Pick<AiRun, "provider" | "model" | "mode" | "apiKey" | "managedAllowed">
  reservation: Pick<GatewayDeps<unknown>, "reserve" | "finalize" | "voidReservation">
  persist: (outcome: ParseOutcome) => Promise<void>
  complete?: (request: StructuredRequest) => Promise<StructuredResponse>
}) {
  const complete = input.complete ?? ((request: StructuredRequest) => completeWithProvider(input.run.provider, request))
  return generateStructured<ResumeContent>(
    {
      mode: input.run.mode,
      provider: input.run.provider,
      model: input.run.model,
      apiKey: input.run.apiKey,
      managedAllowed: input.run.managedAllowed,
      schema: resumeContentSchema as never,
      system: PARSE_SYSTEM_PROMPT,
      user: parseUserMessage(input.text),
    },
    {
      ...input.reservation,
      complete: (user) =>
        complete({
          apiKey: input.run.apiKey,
          model: input.run.model,
          system: PARSE_SYSTEM_PROMPT,
          user,
          schemaName: "resume_sections",
          jsonSchema: RESUME_CONTENT_JSON_SCHEMA,
          thinking: "low",
        }),
      persist: (raw) => input.persist(groundResume(input.text, raw)),
    },
  )
}
