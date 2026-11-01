import "server-only"

import { generateStructured, type GatewayDeps } from "@/lib/ai/gateway"
import { completeWithProvider } from "@/lib/ai/providers"
import type { AiRun } from "@/lib/ai/run-context"
import type { StructuredRequest, StructuredResponse } from "@/lib/ai/types"
import type { GroundedRequirement, RequirementMatch, VerifiedFact } from "@/lib/analyze/types"
import type { ResumeContent } from "@/lib/resume/content"
import {
  TAILOR_JSON_SCHEMA,
  TAILOR_SYSTEM_PROMPT,
  tailorOutputSchema,
  tailorUserMessage,
  validateEdits,
  type RawEdit,
  type ResumeEdit,
  type TailorDropped,
} from "@/lib/resume/tailor"

export type TailorOutcome = { edits: ResumeEdit[]; dropped: TailorDropped }

/** One structured call, then deterministic validation before persist. Dropped edits are counted, never stored. */
export async function tailorResumeContent(input: {
  content: ResumeContent
  requirements: GroundedRequirement[]
  matches: RequirementMatch[]
  facts: VerifiedFact[]
  run: Pick<AiRun, "provider" | "model" | "mode" | "apiKey" | "managedAllowed">
  reservation: Pick<GatewayDeps<unknown>, "reserve" | "finalize" | "voidReservation">
  persist: (outcome: TailorOutcome) => Promise<void>
  complete?: (request: StructuredRequest) => Promise<StructuredResponse>
}) {
  const complete = input.complete ?? ((request: StructuredRequest) => completeWithProvider(input.run.provider, request))
  const user = tailorUserMessage(input)
  return generateStructured<{ edits: RawEdit[] }>(
    {
      mode: input.run.mode,
      provider: input.run.provider,
      model: input.run.model,
      apiKey: input.run.apiKey,
      managedAllowed: input.run.managedAllowed,
      schema: tailorOutputSchema as never,
      system: TAILOR_SYSTEM_PROMPT,
      user,
    },
    {
      ...input.reservation,
      complete: (message) =>
        complete({
          apiKey: input.run.apiKey,
          model: input.run.model,
          system: TAILOR_SYSTEM_PROMPT,
          user: message,
          schemaName: "resume_edits",
          jsonSchema: TAILOR_JSON_SCHEMA,
        }),
      persist: (raw) => input.persist(validateEdits(raw.edits, input.content, input.facts)),
    },
  )
}
