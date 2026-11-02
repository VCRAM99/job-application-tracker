import "server-only"

import { createHash } from "node:crypto"

import { AI_ERROR_MESSAGES, type AiErrorCode } from "@/lib/ai/types"
import { isUuid, type RecordFormState } from "@/lib/records/form-state"

export function fail(message: string): RecordFormState {
  return { status: "error", message, fieldErrors: {} }
}

export function done(message: string | null = null): RecordFormState {
  return { status: "idle", message, fieldErrors: {} }
}

export function requestedMode(formData: FormData): "managed" | "byok" | "local" {
  const value = String(formData.get("executionMode") ?? "")
  return value === "managed" || value === "local" ? value : "byok"
}

/**
 * The page renders a fresh nonce with each form, so a double submit reuses
 * one reservation while a new visit or "Regenerate" starts a new run.
 */
export function requestNonce(formData: FormData): string {
  const value = String(formData.get("nonce") ?? "")
  return isUuid(value) ? value : crypto.randomUUID()
}

export function idempotencyKey(parts: Array<string | number | null | undefined>): string {
  return createHash("sha256").update(parts.map((part) => String(part ?? "")).join("\n")).digest("hex")
}

export function aiFailure(code: AiErrorCode, message: string): RecordFormState {
  if (code === "in_progress") return fail("This is already running. Wait a moment, then reload.")
  return fail(AI_ERROR_MESSAGES[code] ?? message)
}

/** Text fields from a form, trimmed, with a length cap. */
export function field(formData: FormData, key: string, max: number): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}
