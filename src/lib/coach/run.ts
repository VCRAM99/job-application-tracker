import "server-only"

import type { z } from "zod"

import { generateStructured, type GatewayDeps } from "@/lib/ai/gateway"
import { completeWithProvider } from "@/lib/ai/providers"
import type { AiRun } from "@/lib/ai/run-context"
import type { StructuredRequest, StructuredResponse } from "@/lib/ai/types"
import type { GroundedRequirement, VerifiedFact } from "@/lib/analyze/types"
import {
  DRAFT_JSON_SCHEMA,
  draftOutputSchema,
  draftSystemPrompt,
  draftUserMessage,
  validateDraft,
  type DraftContext,
  type DraftOutcome,
  type RawDraft,
} from "@/lib/coach/drafts"
import type { CountMap } from "@/lib/coach/input"
import {
  PRACTICE_JSON_SCHEMA,
  PRACTICE_SYSTEM_PROMPT,
  practiceOutputSchema,
  practiceUserMessage,
  validateFeedback,
  type PracticeFeedback,
  type RawFeedback,
} from "@/lib/coach/practice"
import {
  QUESTIONS_JSON_SCHEMA,
  QUESTIONS_SYSTEM_PROMPT,
  questionsOutputSchema,
  questionsUserMessage,
  validateQuestions,
  type InterviewQuestion,
  type RawQuestion,
} from "@/lib/coach/questions"
import {
  RESEARCH_JSON_SCHEMA,
  RESEARCH_SYSTEM_PROMPT,
  researchOutputSchema,
  researchUserMessage,
  validateClaims,
  type RawClaim,
  type ResearchClaim,
  type ResearchSource,
} from "@/lib/coach/research"
import {
  STORIES_JSON_SCHEMA,
  STORIES_SYSTEM_PROMPT,
  storiesOutputSchema,
  storiesUserMessage,
  validateStories,
  type RawStory,
  type Story,
} from "@/lib/coach/stories"

export type CoachCallBase = {
  run: Pick<AiRun, "provider" | "model" | "mode" | "apiKey" | "managedAllowed">
  reservation: Pick<GatewayDeps<unknown>, "reserve" | "finalize" | "voidReservation">
  complete?: (request: StructuredRequest) => Promise<StructuredResponse>
}

/** One structured call through the M1 gateway; `persist` receives schema-valid output and validates it before saving. */
export function runCoachCall<T>(
  base: CoachCallBase,
  call: { system: string; user: string; schemaName: string; jsonSchema: Record<string, unknown>; schema: z.ZodType<T>; persist: (raw: T, modelUsed: string) => Promise<void> },
) {
  const complete = base.complete ?? ((request: StructuredRequest) => completeWithProvider(base.run.provider, request))
  return generateStructured<T>(
    {
      mode: base.run.mode,
      provider: base.run.provider,
      model: base.run.model,
      apiKey: base.run.apiKey,
      managedAllowed: base.run.managedAllowed,
      schema: call.schema,
      system: call.system,
      user: call.user,
    },
    {
      ...base.reservation,
      complete: (message) =>
        complete({
          apiKey: base.run.apiKey,
          model: base.run.model,
          system: call.system,
          user: message,
          schemaName: call.schemaName,
          jsonSchema: call.jsonSchema,
        }),
      persist: (raw, _id, modelUsed) => call.persist(raw, modelUsed),
    },
  )
}

export function generateQuestions(
  base: CoachCallBase & {
    title: string | null
    company: string | null
    requirements: GroundedRequirement[]
    facts: VerifiedFact[]
    persist: (outcome: { questions: InterviewQuestion[]; dropped: CountMap }, modelUsed: string) => Promise<void>
  },
) {
  return runCoachCall<{ questions: RawQuestion[] }>(base, {
    system: QUESTIONS_SYSTEM_PROMPT,
    user: questionsUserMessage(base),
    schemaName: "interview_questions",
    jsonSchema: QUESTIONS_JSON_SCHEMA,
    schema: questionsOutputSchema as never,
    persist: (raw, modelUsed) => base.persist(validateQuestions(raw.questions, base), modelUsed),
  })
}

export function generateStories(
  base: CoachCallBase & { facts: VerifiedFact[]; persist: (outcome: { stories: Story[]; dropped: CountMap }, modelUsed: string) => Promise<void> },
) {
  return runCoachCall<{ stories: RawStory[] }>(base, {
    system: STORIES_SYSTEM_PROMPT,
    user: storiesUserMessage(base.facts),
    schemaName: "story_bank",
    jsonSchema: STORIES_JSON_SCHEMA,
    schema: storiesOutputSchema as never,
    persist: (raw, modelUsed) => base.persist(validateStories(raw.stories, base.facts), modelUsed),
  })
}

export function coachAnswer(
  base: CoachCallBase & {
    question: InterviewQuestion
    requirements: GroundedRequirement[]
    answer: string
    facts: VerifiedFact[]
    persist: (outcome: { feedback: PracticeFeedback; dropped: CountMap }, modelUsed: string) => Promise<void>
  },
) {
  return runCoachCall<RawFeedback>(base, {
    system: PRACTICE_SYSTEM_PROMPT,
    user: practiceUserMessage(base),
    schemaName: "practice_feedback",
    jsonSchema: PRACTICE_JSON_SCHEMA,
    schema: practiceOutputSchema as never,
    persist: (raw, modelUsed) => base.persist(validateFeedback(raw, base), modelUsed),
  })
}

export function generateBrief(
  base: CoachCallBase & {
    company: string | null
    sources: ResearchSource[]
    persist: (outcome: { claims: ResearchClaim[]; dropped: CountMap }, modelUsed: string) => Promise<void>
  },
) {
  return runCoachCall<{ claims: RawClaim[] }>(base, {
    system: RESEARCH_SYSTEM_PROMPT,
    user: researchUserMessage(base),
    schemaName: "research_brief",
    jsonSchema: RESEARCH_JSON_SCHEMA,
    schema: researchOutputSchema as never,
    persist: (raw, modelUsed) => base.persist(validateClaims(raw.claims, base.sources, base.company), modelUsed),
  })
}

export function generateDraft(base: CoachCallBase & { context: DraftContext; persist: (outcome: DraftOutcome, modelUsed: string) => Promise<void> }) {
  return runCoachCall<RawDraft>(base, {
    system: draftSystemPrompt(base.context),
    user: draftUserMessage(base.context),
    schemaName: "coach_draft",
    jsonSchema: DRAFT_JSON_SCHEMA,
    schema: draftOutputSchema as never,
    persist: (raw, modelUsed) => base.persist(validateDraft(raw, base.context), modelUsed),
  })
}
