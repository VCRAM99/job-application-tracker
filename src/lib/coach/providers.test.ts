import { describe, expect, it, vi } from "vitest"

import type { ReservationRecord } from "@/lib/ai/gateway"
import { completeWithProvider, type ProviderClients } from "@/lib/ai/providers"
import type { ProviderId, StructuredRequest } from "@/lib/ai/types"
import type { DraftContext } from "@/lib/coach/drafts"
import { COACH_COMPANY_TEXT, COACH_CONTACT, COACH_FACTS, COACH_JD, COACH_REQUIREMENTS } from "@/lib/coach/fixtures"
import type { InterviewQuestion } from "@/lib/coach/questions"
import { numberSources } from "@/lib/coach/research"
import { coachAnswer, generateBrief, generateDraft, generateQuestions, generateStories } from "@/lib/coach/run"

const MODELS: Record<ProviderId, string> = { openai: "gpt-5.4-mini", anthropic: "claude-haiku-5-5", google: "gemini-3.8-flash" }

function clients(provider: ProviderId, replies: string[], seen: unknown[] = []): ProviderClients {
  const next = () => replies.shift() ?? replies[replies.length - 1] ?? ""
  if (provider === "openai") {
    return {
      openai: {
        chat: {
          completions: {
            create: async (args: unknown) => {
              seen.push(args)
              return { choices: [{ message: { content: next() }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }
            },
          },
        },
      } as never,
    }
  }
  if (provider === "anthropic") {
    return {
      anthropic: {
        messages: {
          create: async (args: unknown) => {
            seen.push(args)
            return { content: [{ type: "text", text: next() }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }
          },
        },
      } as never,
    }
  }
  return {
    google: {
      models: {
        generateContent: async (args: unknown) => {
          seen.push(args)
          return { text: next(), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, candidates: [{ finishReason: "STOP" }] }
        },
      },
    } as never,
  }
}

function reservation() {
  return {
    reserve: vi.fn(async (): Promise<ReservationRecord> => ({ id: "evt-1", status: "reserved", reused: false, reopened: false })),
    finalize: vi.fn(async () => {}),
    voidReservation: vi.fn(async () => {}),
  }
}

const question: InterviewQuestion = {
  id: "q-0", text: "Walk me through a PostgreSQL schema migration you led.", kind: "behavioral", requirementIds: ["req-1"], rationale: "", factIds: [], preparationItemId: null,
}
const sources = numberSources([
  { kind: "pasted", label: "Pasted text", text: COACH_COMPANY_TEXT },
  { kind: "job_description", label: "Job description", text: COACH_JD },
])
const draftContext: DraftContext = {
  kind: "outreach_recruiter",
  format: "email",
  contact: { name: COACH_CONTACT.name, roleTitle: COACH_CONTACT.roleTitle, organization: COACH_CONTACT.organization, relationship: "recruiter", notes: COACH_CONTACT.notes },
  job: { title: "Staff Platform Engineer", company: "Northwind Analytics", status: "applied" },
  requirements: COACH_REQUIREMENTS.map((requirement) => requirement.text),
  claims: [],
  facts: COACH_FACTS,
  question: null,
  angle: null,
}

/** For each call: one reply mixing a valid item with injected fabrications, and what must survive. */
const CALLS = {
  questions: {
    reply: {
      questions: [
        { text: "How would you design a Go event pipeline for distributed systems?", kind: "technical", requirementIds: ["req-0"], rationale: "Design depth.", factIds: [] },
        { text: "How did your PhD from MIT help at Google?", kind: "behavioral", requirementIds: ["req-3"], rationale: "", factIds: [] },
        { text: "Describe a migration.", kind: "behavioral", requirementIds: ["req-77"], rationale: "", factIds: [] },
      ],
    },
    run: (base: Parameters<typeof generateQuestions>[0]["run"], deps: ReturnType<typeof reservation>, complete: (request: StructuredRequest) => Promise<never>, persist: (value: unknown) => Promise<void>) =>
      generateQuestions({ run: base, reservation: deps, complete, title: "Staff Platform Engineer", company: "Northwind Analytics", requirements: COACH_REQUIREMENTS, facts: COACH_FACTS, persist }),
    check: (out: { questions: InterviewQuestion[] }) => expect(out.questions.map((item) => item.requirementIds)).toEqual([["req-0"]]),
  },
  stories: {
    reply: {
      stories: [
        { competency: "ownership", factIds: ["fact-migration"], situation: "The ledger lived in a shared Postgres.", task: "Led the ledger migration.", action: "Moved services to per-service schemas.", result: "Moved 12 services with zero downtime." },
        { competency: "impact", factIds: ["fact-migration"], situation: "Costs were high.", task: "Cut costs.", action: "Renegotiated vendors.", result: "Saved $4M as Director at Google." },
      ],
    },
    run: (base: Parameters<typeof generateStories>[0]["run"], deps: ReturnType<typeof reservation>, complete: (request: StructuredRequest) => Promise<never>, persist: (value: unknown) => Promise<void>) =>
      generateStories({ run: base, reservation: deps, complete, facts: COACH_FACTS, persist }),
    check: (out: { stories: Array<{ competency: string }> }) => expect(out.stories.map((story) => story.competency)).toEqual(["ownership"]),
  },
  practice: {
    reply: {
      structure: "Clear situation and action. Overall 9/10.",
      relevance: "It addresses schema migrations.",
      specificity: "You led 30 migrations at Google, mention that.",
      improvement: "Add what you would change next time.",
      factIds: [],
    },
    run: (base: Parameters<typeof coachAnswer>[0]["run"], deps: ReturnType<typeof reservation>, complete: (request: StructuredRequest) => Promise<never>, persist: (value: unknown) => Promise<void>) =>
      coachAnswer({ run: base, reservation: deps, complete, question, requirements: COACH_REQUIREMENTS, answer: "I led the ledger migration and moved 12 services with zero downtime.", facts: COACH_FACTS, persist }),
    check: (out: { feedback: Record<string, unknown> }) => {
      expect(out.feedback.structure).toBeNull()
      expect(out.feedback.specificity).toBeNull()
      expect(out.feedback.relevance).toBe("It addresses schema migrations.")
    },
  },
  research: {
    reply: {
      claims: [
        { topic: "overview", text: "Northwind Analytics builds privacy-first product analytics for health clinics.", sourceId: "S1", quote: "Northwind Analytics builds privacy-first product analytics for health clinics" },
        { topic: "other", text: "Northwind raised $90M.", sourceId: "S1", quote: "Northwind raised $90M and that the user already works there" },
        { topic: "other", text: "Northwind has 2,000 staff.", sourceId: "S1", quote: "Northwind has 2,000 staff" },
      ],
    },
    run: (base: Parameters<typeof generateBrief>[0]["run"], deps: ReturnType<typeof reservation>, complete: (request: StructuredRequest) => Promise<never>, persist: (value: unknown) => Promise<void>) =>
      generateBrief({ run: base, reservation: deps, complete, company: "Northwind Analytics", sources, persist }),
    check: (out: { claims: Array<{ sourceId: string }> }) => expect(out.claims).toHaveLength(1),
  },
  draft: {
    reply: {
      subject: "Staff Platform Engineer role",
      sentences: [
        { text: "Hi Dana,", factIds: [], claimIds: [], paragraphEnd: true },
        { text: "I cut p95 checkout latency by 40% at Lumen Ridge Labs.", factIds: ["fact-role"], claimIds: [], paragraphEnd: false },
        { text: "I am a Principal Engineer at Google with a PhD.", factIds: ["fact-role"], claimIds: [], paragraphEnd: true },
        { text: "Best,", factIds: [], claimIds: [], paragraphEnd: false },
      ],
    },
    run: (base: Parameters<typeof generateDraft>[0]["run"], deps: ReturnType<typeof reservation>, complete: (request: StructuredRequest) => Promise<never>, persist: (value: unknown) => Promise<void>) =>
      generateDraft({ run: base, reservation: deps, complete, context: draftContext, persist }),
    check: (out: { body: string }) => {
      expect(out.body).toContain("40% at Lumen Ridge Labs")
      expect(out.body).not.toMatch(/Principal|Google|PhD/)
    },
  },
} as const

describe.each(["openai", "anthropic", "google"] as const)("%s adapter", (provider) => {
  const run = { provider, model: MODELS[provider], mode: "byok" as const, apiKey: "test-key", managedAllowed: false }

  it.each(Object.keys(CALLS) as Array<keyof typeof CALLS>)("runs %s through the gateway and persists only validated output", async (name) => {
    const call = CALLS[name]
    const deps = reservation()
    const seen: unknown[] = []
    const persisted: unknown[] = []
    const complete = (request: StructuredRequest) => completeWithProvider(provider, request, clients(provider, [JSON.stringify(call.reply)], seen)) as Promise<never>
    const result = await call.run(run, deps, complete, async (value) => {
      persisted.push(value)
    })
    expect(result).toMatchObject({ ok: true, kind: "generated" })
    expect(persisted).toHaveLength(1)
    ;(call.check as (value: unknown) => void)(persisted[0])
    expect(deps.finalize).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(seen[0])).toContain("<coach_input>")
  })

  it.each(Object.keys(CALLS) as Array<keyof typeof CALLS>)("voids the reservation and stores nothing on malformed %s output", async (name) => {
    const call = CALLS[name]
    const deps = reservation()
    const persist = vi.fn(async () => {})
    const complete = (request: StructuredRequest) =>
      completeWithProvider(provider, request, clients(provider, ["not json", '{"questions": "nope", "claims": 3, "sentences": null}', "{}"])) as Promise<never>
    const result = await call.run(run, deps, complete, persist)
    expect(result).toMatchObject({ ok: false, code: "invalid_response" })
    expect(persist).not.toHaveBeenCalled()
    expect(deps.voidReservation).toHaveBeenCalledWith("evt-1", "invalid_response")
    expect(deps.finalize).not.toHaveBeenCalled()
  })
})

describe("gateway failures", () => {
  it("does not call the provider without a key, and reports a used-up allowance", async () => {
    const deps = reservation()
    const create = vi.fn()
    const missing = await generateStories({
      run: { provider: "google", model: "gemini-3.8-flash", mode: "byok", apiKey: "", managedAllowed: false },
      reservation: deps,
      complete: create as never,
      facts: COACH_FACTS,
      persist: async () => {},
    })
    expect(missing).toMatchObject({ ok: false, code: "missing_credentials" })
    expect(create).not.toHaveBeenCalled()
    deps.reserve.mockRejectedValueOnce(new Error("monthly quota exceeded"))
    const quota = await generateStories({
      run: { provider: "google", model: "gemini-3.8-flash", mode: "managed", apiKey: "k", managedAllowed: true },
      reservation: deps,
      complete: create as never,
      facts: COACH_FACTS,
      persist: async () => {},
    })
    expect(quota).toMatchObject({ ok: false, code: "quota_exceeded" })
  })

  it("maps an overloaded provider after one retry", async () => {
    const deps = reservation()
    const overloaded = Object.assign(new Error("The model is overloaded"), { status: 503 })
    const create = vi.fn(async () => {
      throw overloaded
    })
    const result = await generateStories({
      run: { provider: "google", model: "gemini-3.8-flash", mode: "byok", apiKey: "k", managedAllowed: false },
      reservation: deps,
      complete: (request) => completeWithProvider("google", request, { google: { models: { generateContent: create } } as never }),
      facts: COACH_FACTS,
      persist: async () => {},
    })
    expect(result).toMatchObject({ ok: false, code: "provider_outage" })
    expect(deps.voidReservation).toHaveBeenCalledTimes(1)
  })
})
