import { describe, expect, it, vi } from "vitest"

import type { ReservationRecord } from "@/lib/ai/gateway"
import { completeWithProvider, type ProviderClients } from "@/lib/ai/providers"
import type { ProviderId, StructuredRequest } from "@/lib/ai/types"
import type { VerifiedFact } from "@/lib/analyze/types"
import type { ResumeContent } from "@/lib/resume/content"
import { AVERY_TEXT } from "@/lib/resume/fixtures/avery"
import { groundResume } from "@/lib/resume/parse"
import { parseResumeText, type ParseOutcome } from "@/lib/resume/run-parse"
import { tailorResumeContent, type TailorOutcome } from "@/lib/resume/run-tailor"

const MODELS: Record<ProviderId, string> = { openai: "gpt-5.4-mini", anthropic: "claude-haiku-5-5", google: "gemini-3.8-flash" }

function clients(provider: ProviderId, replies: string[], seen: StructuredRequest[] = []): ProviderClients {
  const next = () => replies.shift() ?? replies[replies.length - 1] ?? ""
  if (provider === "openai") {
    return {
      openai: {
        chat: {
          completions: {
            create: async (args: unknown) => {
              seen.push(args as never)
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
            seen.push(args as never)
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
          seen.push(args as never)
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

const parsed: ResumeContent = {
  contact: { name: "Avery Quill", email: "avery.quill@example.com", phone: null, location: null, links: [] },
  summary: "Backend engineer with 6 years building payment and data services.",
  experience: [
    {
      title: "Senior Backend Engineer",
      company: "Lumen Ridge Labs",
      location: "Toronto",
      start: "Jan 2022",
      end: "Present",
      bullets: [
        "Cut p95 checkout latency by 40% by moving fraud checks to an async queue.",
        "Cut p95 checkout latency by 70% across every service.",
      ],
    },
  ],
  education: [],
  skills: ["TypeScript", "Kubernetes"],
  projects: [],
  other: [],
}

const facts: VerifiedFact[] = [
  { id: "f-kafka", type: "skill", title: "Kafka", detail: "", evidence: null, updatedAt: "2026-10-01T00:00:00.000Z", startDate: null, endDate: null },
  {
    id: "f-role",
    type: "employment",
    title: "Senior Backend Engineer",
    detail: "Lumen Ridge Labs",
    evidence: "Moved checkout fraud checks onto a Kafka queue.",
    updatedAt: "2026-10-01T00:00:00.000Z",
    startDate: null,
    endDate: null,
  },
]

describe.each(["openai", "anthropic", "google"] as const)("%s adapter", (provider) => {
  const run = { provider, model: MODELS[provider], mode: "byok" as const, apiKey: "test-key", managedAllowed: false }

  it("parses through the gateway and persists only grounded content", async () => {
    const deps = reservation()
    const seen: StructuredRequest[] = []
    const persisted: ParseOutcome[] = []
    const result = await parseResumeText({
      text: AVERY_TEXT,
      run,
      reservation: deps,
      persist: async (outcome) => {
        persisted.push(outcome)
      },
      complete: (request) => completeWithProvider(provider, request, clients(provider, [JSON.stringify(parsed)], seen)),
    })
    expect(result).toMatchObject({ ok: true, kind: "generated" })
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.dropped).toMatchObject({ bullets: 1, skills: 1 })
    expect(persisted[0]?.content.experience[0]?.bullets).toEqual(["Cut p95 checkout latency by 40% by moving fraud checks to an async queue."])
    expect(deps.finalize).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(seen[0])).toContain("<resume>")
  })

  it("tailors through the gateway and persists only validated edits", async () => {
    const deps = reservation()
    const content = groundResume(AVERY_TEXT, parsed).content
    const persisted: TailorOutcome[] = []
    const reply = JSON.stringify({
      edits: [
        {
          op: "rewrite_bullet",
          target: "experience[0].bullets[0]",
          before: content.experience[0]!.bullets[0],
          after: "Cut p95 checkout latency by 40% by moving fraud checks to an async Kafka queue.",
          order: [],
          rationale: "Names the queue technology from a verified fact.",
          factIds: ["f-role"],
        },
        { op: "add_skill", target: "skills", before: "", after: "Kafka", order: [], rationale: "Verified skill.", factIds: ["f-kafka"] },
        { op: "add_skill", target: "skills", before: "", after: "Terraform", order: [], rationale: "JD asks for it.", factIds: [] },
      ],
    })
    const result = await tailorResumeContent({
      content,
      requirements: [],
      matches: [],
      facts,
      run,
      reservation: deps,
      persist: async (outcome) => {
        persisted.push(outcome)
      },
      complete: (request) => completeWithProvider(provider, request, clients(provider, [reply])),
    })
    expect(result).toMatchObject({ ok: true })
    expect(persisted[0]?.edits.map((edit) => edit.op)).toEqual(["rewrite_bullet", "add_skill"])
    expect(persisted[0]?.edits.every((edit) => edit.status === "pending")).toBe(true)
    expect(persisted[0]?.dropped).toEqual({ no_evidence: 1 })
  })

  it.each(["parse", "tailor"] as const)("voids the reservation and stores nothing on malformed %s output", async (call) => {
    const deps = reservation()
    const persist = vi.fn(async () => {})
    const complete = (request: StructuredRequest) =>
      completeWithProvider(provider, request, clients(provider, ["not json", '{"edits": "nope"}', "{}"]))
    const result =
      call === "parse"
        ? await parseResumeText({ text: AVERY_TEXT, run, reservation: deps, persist, complete })
        : await tailorResumeContent({ content: parsed, requirements: [], matches: [], facts, run, reservation: deps, persist, complete })
    expect(result).toMatchObject({ ok: false, code: "invalid_response" })
    expect(persist).not.toHaveBeenCalled()
    expect(deps.voidReservation).toHaveBeenCalledWith("evt-1", "invalid_response")
    expect(deps.finalize).not.toHaveBeenCalled()
  })
})
