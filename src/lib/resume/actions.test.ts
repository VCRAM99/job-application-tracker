import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  parseResumeText: vi.fn(),
  usageReservationDeps: vi.fn((_supabase: unknown, input: { idempotencyKey: string }) => ({ key: input.idempotencyKey })),
  rows: [] as Array<Record<string, unknown>>,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", email: null })), getCurrentUser: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", email: null })) }))
vi.mock("@/lib/resume/flags", () => ({ resumeStudioEnabled: () => true }))
vi.mock("@/lib/resume/run-parse", () => ({ parseResumeText: mocks.parseResumeText }))
vi.mock("@/lib/ai/run-context", () => ({
  prepareAiRun: vi.fn(async () => ({
    ok: true,
    run: { provider: "google", model: "gemini-3.8-flash", mode: "byok", apiKey: "k", managedAllowed: false, secret: "s".repeat(40) },
  })),
  usageReservationDeps: mocks.usageReservationDeps,
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const builder = {
      select: () => builder,
      update: () => builder,
      eq: () => builder,
      neq: () => builder,
      maybeSingle: async () => ({ data: mocks.rows.shift() ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: null, error: null }),
    }
    return { from: () => builder }
  }),
}))

import { parseResume } from "@/lib/resume/actions"
import { initialRecordFormState } from "@/lib/records/form-state"

const RESUME = "22222222-2222-4222-8222-222222222222"
const row = { id: RESUME, sha256: "a".repeat(64), extracted_text: "Avery Quill", parse_status: "unparsed", parse_prompt_version: null }

function form() {
  const data = new FormData()
  data.set("resumeId", RESUME)
  return data
}

describe("parseResume idempotency", () => {
  beforeEach(() => {
    mocks.parseResumeText.mockReset()
    mocks.usageReservationDeps.mockClear()
    mocks.rows.length = 0
  })

  it("runs again under a fresh key when a past reservation succeeded but this row has no parse", async () => {
    mocks.rows.push(row, { parse_status: "unparsed", parse_prompt_version: null })
    mocks.parseResumeText
      .mockResolvedValueOnce({ ok: true, kind: "already-complete", usageEventId: "old" })
      .mockResolvedValueOnce({ ok: true, kind: "generated", usageEventId: "new", data: {}, usage: {} })
    const result = await parseResume(initialRecordFormState, form())
    expect(result).toMatchObject({ status: "idle", message: expect.stringMatching(/^Parsed/) })
    const keys = mocks.usageReservationDeps.mock.calls.map(([, input]) => input.idempotencyKey)
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
  })

  it("keys a parse by resume id as well as file hash", async () => {
    mocks.parseResumeText.mockResolvedValue({ ok: true, kind: "generated", usageEventId: "e", data: {}, usage: {} })
    mocks.rows.push(row)
    await parseResume(initialRecordFormState, form())
    mocks.rows.push({ ...row, id: "33333333-3333-4333-8333-333333333333" })
    const other = new FormData()
    other.set("resumeId", "33333333-3333-4333-8333-333333333333")
    await parseResume(initialRecordFormState, other)
    const keys = mocks.usageReservationDeps.mock.calls.map(([, input]) => input.idempotencyKey)
    expect(new Set(keys).size).toBe(2)
  })
})
