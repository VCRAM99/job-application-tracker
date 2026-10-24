import type { z } from "zod"

import { assertSupportedModel } from "@/lib/ai/models"
import { mapProviderFailure } from "@/lib/ai/provider-error"
import {
  AiRequestError,
  type AiErrorCode,
  type ExecutionMode,
  type StructuredResponse,
  type TokenUsage,
} from "@/lib/ai/types"

export type ReservationRecord = {
  id: string
  status: "reserved" | "succeeded" | "voided" | "failed" | "expired"
  reused: boolean
  reopened: boolean
}

export type GatewayDeps<T> = {
  reserve: () => Promise<ReservationRecord>
  finalize: (id: string, usage: TokenUsage) => Promise<void>
  voidReservation: (id: string, code: string) => Promise<void>
  complete: (user: string) => Promise<StructuredResponse>
  persist?: (data: T, usageEventId: string) => Promise<void>
}

export type GenerateResult<T> =
  | {
      ok: true
      kind: "generated"
      usageEventId: string
      data: T
      usage: TokenUsage
    }
  | { ok: true; kind: "already-complete"; usageEventId: string }
  | { ok: false; code: AiErrorCode; message: string; usageEventId?: string }

export async function generateStructured<T>(
  input: {
    mode: ExecutionMode
    provider: string
    model: string
    apiKey: string | null
    managedAllowed: boolean
    schema: z.ZodType<T>
    system: string
    user: string
  },
  deps: GatewayDeps<T>,
): Promise<GenerateResult<T>> {
  if (input.mode === "local") return failure("mode_unavailable")
  if (input.mode === "managed" && !input.managedAllowed) return failure("managed_unconfigured")
  if (!input.apiKey) return failure("missing_credentials")

  try {
    assertSupportedModel(input.provider, input.model)
  } catch (error) {
    if (error instanceof AiRequestError) return failure(error.code)
    return failure("unsupported_model")
  }

  let reservation: ReservationRecord
  try {
    reservation = await deps.reserve()
  } catch (error) {
    return failure(reservationFailureCode(error))
  }

  if (reservation.reused && reservation.status === "succeeded") {
    return { ok: true, kind: "already-complete", usageEventId: reservation.id }
  }
  if (reservation.reused && reservation.status === "reserved") {
    return failure("in_progress", reservation.id)
  }

  let userMessage = input.user
  let repairs = 0
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await deps.complete(userMessage)
      const parsed = parseStructured(input.schema, response.text)
      if (!parsed.success) {
        if (repairs < 1) {
          repairs += 1
          userMessage = `${input.user}\nThe previous response was not valid JSON for this schema. Return only the corrected JSON.`
          attempt -= 1
          continue
        }
        await deps.voidReservation(reservation.id, "invalid_response")
        return failure("invalid_response", reservation.id)
      }
      const usage = {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      }
      if (deps.persist) await deps.persist(parsed.data, reservation.id)
      await deps.finalize(reservation.id, usage)
      return {
        ok: true,
        kind: "generated",
        usageEventId: reservation.id,
        data: parsed.data,
        usage,
      }
    } catch (error) {
      const ai = mapProviderFailure(error)
      if (!ai.retryable || attempt === 3) {
        await deps.voidReservation(reservation.id, ai.code)
        return failure(ai.code, reservation.id)
      }
    }
  }

  await deps.voidReservation(reservation.id, "transient")
  return failure("transient", reservation.id)
}

/**
 * One analysis is one reservation. The caller may make more than one provider
 * call inside `work` and must return the combined token usage.
 */
export async function withUsageReservation<T>(
  input: {
    mode: ExecutionMode
    provider: string
    model: string
    apiKey: string | null
    managedAllowed: boolean
  },
  deps: Omit<GatewayDeps<T>, "complete" | "persist">,
  work: () => Promise<{ data: T; usage: TokenUsage }>,
): Promise<GenerateResult<T>> {
  if (input.mode === "local") return failure("mode_unavailable")
  if (input.mode === "managed" && !input.managedAllowed) return failure("managed_unconfigured")
  if (!input.apiKey) return failure("missing_credentials")

  try {
    assertSupportedModel(input.provider, input.model)
  } catch (error) {
    if (error instanceof AiRequestError) return failure(error.code)
    return failure("unsupported_model")
  }

  let reservation: ReservationRecord
  try {
    reservation = await deps.reserve()
  } catch (error) {
    return failure(reservationFailureCode(error))
  }

  if (reservation.reused && reservation.status === "succeeded") {
    return { ok: true, kind: "already-complete", usageEventId: reservation.id }
  }
  if (reservation.reused && reservation.status === "reserved") {
    return failure("in_progress", reservation.id)
  }

  try {
    const produced = await work()
    await deps.finalize(reservation.id, produced.usage)
    return {
      ok: true,
      kind: "generated",
      usageEventId: reservation.id,
      data: produced.data,
      usage: produced.usage,
    }
  } catch (error) {
    const ai = mapProviderFailure(error)
    try {
      await deps.voidReservation(reservation.id, ai.code)
    } catch {
      return failure(ai.code, reservation.id)
    }
    return failure(ai.code, reservation.id)
  }
}

function parseStructured<T>(schema: z.ZodType<T>, text: string) {
  try {
    return schema.safeParse(JSON.parse(text))
  } catch {
    return { success: false as const, data: undefined, error: null }
  }
}

function reservationFailureCode(error: unknown): AiErrorCode {
  if (error instanceof AiRequestError) return error.code
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("reservation in progress")) return "in_progress"
  if (message.includes("quota")) return "quota_exceeded"
  if (message.includes("accounting") || message.includes("not authorized")) return "accounting_unconfigured"
  if (message.includes("not configured")) return "managed_unconfigured"
  return "transient"
}

function failure<T>(code: AiErrorCode, usageEventId?: string): GenerateResult<T> {
  return {
    ok: false,
    code,
    message: new AiRequestError(code).message,
    usageEventId,
  }
}
