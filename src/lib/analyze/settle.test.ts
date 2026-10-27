import { describe, expect, it, vi } from "vitest"

import { withUsageReservation, type ReservationRecord } from "@/lib/ai/gateway"
import { analysisModelFor } from "@/lib/analyze/constants"
import { settleDuplicateRun } from "@/lib/analyze/settle"

const input = {
  mode: "byok" as const,
  provider: "google",
  model: analysisModelFor("google", {}),
  apiKey: "test-key",
  managedAllowed: false,
}

describe("duplicate analysis runs", () => {
  it("resolves a second identical run to the first run's analysis with one charge", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const reservations = new Map<string, ReservationRecord>()
    const charges: string[] = []
    let stored: string | null = null
    let works = 0
    // Mirrors reserve_ai_usage: one row per idempotency key, reused while open.
    const deps = {
      reserve: async (): Promise<ReservationRecord> => {
        const existing = reservations.get("same-key")
        if (existing) return { ...existing, reused: true }
        const created: ReservationRecord = { id: "evt-1", status: "reserved", reused: false, reopened: false }
        reservations.set("same-key", created)
        return created
      },
      finalize: async (id: string) => {
        charges.push(id)
        reservations.set("same-key", { id, status: "succeeded", reused: false, reopened: false })
      },
      voidReservation: async () => {},
    }
    const work = async () => {
      works += 1
      await gate
      stored = "analysis-1"
      return { data: "analysis-1", usage: { inputTokens: 10, outputTokens: 5 } }
    }

    const first = withUsageReservation(input, deps, work)
    await vi.waitFor(() => expect(reservations.has("same-key")).toBe(true))
    const second = await withUsageReservation(input, deps, work)
    expect(second).toMatchObject({ ok: false, code: "in_progress", usageEventId: "evt-1" })
    if (second.ok) return

    const waits: number[] = []
    const settled = settleDuplicateRun(second, async () => stored, {
      delayMs: 5,
      wait: async (ms) => {
        waits.push(ms)
        if (waits.length === 2) release()
        await new Promise((resolve) => setTimeout(resolve, 0))
      },
    })
    await expect(first).resolves.toMatchObject({ ok: true, kind: "generated", data: "analysis-1" })
    await expect(settled).resolves.toBe("analysis-1")
    expect(works).toBe(1)
    expect(charges).toEqual(["evt-1"])
  })

  it("does not wait when another analysis holds the reservation", async () => {
    const find = vi.fn(async () => "other")
    await expect(settleDuplicateRun({ code: "in_progress" }, find)).resolves.toBeNull()
    await expect(settleDuplicateRun({ code: "quota_exceeded", usageEventId: "evt-1" }, find)).resolves.toBeNull()
    expect(find).not.toHaveBeenCalled()
  })

  it("gives up after the attempt limit when the other run never completes", async () => {
    const find = vi.fn(async () => null)
    const wait = vi.fn(async () => {})
    await expect(
      settleDuplicateRun({ code: "in_progress", usageEventId: "evt-1" }, find, { attempts: 3, wait }),
    ).resolves.toBeNull()
    expect(find).toHaveBeenCalledTimes(3)
  })
})
