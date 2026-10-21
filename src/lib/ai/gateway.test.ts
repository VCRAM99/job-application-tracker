import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { generateStructured, type ReservationRecord } from "@/lib/ai/gateway"
import { resolveExecutionMode } from "@/lib/ai/mode"
import { AiRequestError } from "@/lib/ai/types"

const schema = z.object({ skills: z.array(z.string()) }).strict()
const good = JSON.stringify({ skills: ["TypeScript"] })

function harness(complete: (user: string) => Promise<{ text: string; inputTokens: number | null; outputTokens: number | null; finishReason: string | null }>) {
  const calls = { reserve: 0, complete: 0, finalize: 0, voided: 0 }
  const deps = {
    reserve: vi.fn(async (): Promise<ReservationRecord> => {
      calls.reserve += 1
      return { id: "evt-1", status: "reserved", reused: false, reopened: false }
    }),
    finalize: vi.fn(async () => {
      calls.finalize += 1
    }),
    voidReservation: vi.fn(async () => {
      calls.voided += 1
    }),
    complete: vi.fn(async (user: string) => {
      calls.complete += 1
      return complete(user)
    }),
  }
  return { calls, deps }
}

const base = {
  mode: "byok" as const,
  provider: "openai",
  model: "gpt-5.4-mini",
  apiKey: "sk-test",
  managedAllowed: false,
  schema,
  system: "system",
  user: "resume",
}

describe("generateStructured", () => {
  it("does not reserve when the key or mode cannot run", async () => {
    const missing = harness(async () => ({ text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }))
    const result = await generateStructured({ ...base, apiKey: null }, missing.deps)
    expect(result).toMatchObject({ ok: false, code: "missing_credentials" })
    expect(missing.calls.reserve).toBe(0)

    const managed = harness(async () => ({ text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }))
    const blocked = await generateStructured({ ...base, mode: "managed", apiKey: "platform" }, managed.deps)
    expect(blocked).toMatchObject({ ok: false, code: "managed_unconfigured" })
    expect(managed.calls.reserve).toBe(0)

    const local = await generateStructured({ ...base, mode: "local" }, missing.deps)
    expect(local).toMatchObject({ ok: false, code: "mode_unavailable" })
  })

  it("rejects an unsupported model before reservation", async () => {
    const run = harness(async () => ({ text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }))
    const result = await generateStructured({ ...base, model: "gpt-obsolete" }, run.deps)
    expect(result).toMatchObject({ ok: false, code: "unsupported_model" })
    expect(run.calls.reserve).toBe(0)
  })

  it("repairs one invalid response and stores missing usage as null", async () => {
    const texts = ["not-json", good]
    const run = harness(async () => {
      const text = texts.shift() ?? good
      return { text, inputTokens: null, outputTokens: null, finishReason: "stop" }
    })
    const persisted: unknown[] = []
    const result = await generateStructured(base, {
      ...run.deps,
      persist: async (data) => {
        persisted.push(data)
      },
    })
    expect(result).toMatchObject({
      ok: true,
      kind: "generated",
      usage: { inputTokens: null, outputTokens: null },
    })
    expect(run.calls.complete).toBe(2)
    expect(run.calls.finalize).toBe(1)
    expect(persisted).toEqual([{ skills: ["TypeScript"] }])
  })

  it("voids authentication errors without retry and retries rate limits three times", async () => {
    const auth = harness(async () => {
      throw Object.assign(new Error("denied"), { status: 401 })
    })
    const denied = await generateStructured(base, auth.deps)
    expect(denied).toMatchObject({ ok: false, code: "invalid_credentials" })
    expect(auth.calls.complete).toBe(1)
    expect(auth.calls.voided).toBe(1)
    expect(auth.calls.finalize).toBe(0)

    const limited = harness(async () => {
      throw Object.assign(new Error("slow"), { status: 429 })
    })
    const blocked = await generateStructured(base, limited.deps)
    expect(blocked).toMatchObject({ ok: false, code: "rate_limited" })
    expect(limited.calls.complete).toBe(3)
    expect(limited.calls.voided).toBe(1)
  })

  it("treats a reused success as already complete and a reused reservation as in progress", async () => {
    const success = harness(async () => ({ text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }))
    success.deps.reserve.mockResolvedValue({
      id: "evt-9",
      status: "succeeded",
      reused: true,
      reopened: false,
    })
    const again = await generateStructured(base, success.deps)
    expect(again).toEqual({ ok: true, kind: "already-complete", usageEventId: "evt-9" })
    expect(success.calls.complete).toBe(0)

    const running = harness(async () => ({ text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }))
    running.deps.reserve.mockResolvedValue({
      id: "evt-8",
      status: "reserved",
      reused: true,
      reopened: false,
    })
    const pending = await generateStructured(base, running.deps)
    expect(pending).toMatchObject({ ok: false, code: "in_progress", usageEventId: "evt-8" })
    expect(running.calls.complete).toBe(0)
  })

  it("shares one reservation across concurrent calls with the same idempotency key", async () => {
    let release: (value: string) => void = () => {}
    const gate = new Promise<string>((resolve) => {
      release = resolve
    })
    const rows = new Map<string, ReservationRecord>()
    let completes = 0
    const reserve = async (): Promise<ReservationRecord> => {
      const existing = rows.get("same-key")
      if (existing) return { ...existing, reused: true }
      const created: ReservationRecord = { id: "evt-shared", status: "reserved", reused: false, reopened: false }
      rows.set("same-key", created)
      return created
    }
    const first = generateStructured(base, {
      reserve,
      finalize: async () => {
        rows.set("same-key", { id: "evt-shared", status: "succeeded", reused: false, reopened: false })
      },
      voidReservation: async () => {},
      complete: async () => {
        completes += 1
        const text = await gate
        return { text, inputTokens: 2, outputTokens: 1, finishReason: "stop" }
      },
    })
    await vi.waitFor(() => expect(rows.has("same-key")).toBe(true))
    const second = await generateStructured(base, {
      reserve,
      finalize: async () => {},
      voidReservation: async () => {},
      complete: async () => {
        completes += 1
        return { text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }
      },
    })
    expect(second).toMatchObject({ ok: false, code: "in_progress" })
    expect(completes).toBe(1)
    release(good)
    await expect(first).resolves.toMatchObject({ ok: true, kind: "generated" })
  })

  it("maps a quota error from reservation and does not switch modes silently", async () => {
    const run = harness(async () => ({ text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }))
    run.deps.reserve.mockRejectedValue(new Error("quota exceeded"))
    const result = await generateStructured({ ...base, mode: "managed", managedAllowed: true }, run.deps)
    expect(result).toMatchObject({ ok: false, code: "quota_exceeded" })
    expect(resolveExecutionMode("byok", "managed")).toEqual({ ok: false, code: "mode_mismatch" })
    const unauthorized = harness(async () => ({ text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }))
    unauthorized.deps.reserve.mockRejectedValue(new Error("not authorized"))
    await expect(generateStructured({ ...base, mode: "managed", managedAllowed: true }, unauthorized.deps)).resolves.toMatchObject({
      ok: false,
      code: "accounting_unconfigured",
    })
    expect(resolveExecutionMode("byok", "byok")).toEqual({ ok: true, mode: "byok" })
    expect(resolveExecutionMode(null, "byok")).toEqual({ ok: false, code: "not_configured" })
  })

  it("does not retry a non-retryable persist failure", async () => {
    const run = harness(async () => ({ text: good, inputTokens: 1, outputTokens: 1, finishReason: "stop" }))
    const result = await generateStructured(base, {
      ...run.deps,
      persist: async () => {
        throw new AiRequestError("transient")
      },
    })
    expect(result).toMatchObject({ ok: false, code: "transient" })
    expect(run.calls.complete).toBe(1)
    expect(run.calls.finalize).toBe(0)
    expect(run.calls.voided).toBe(1)
  })
})
