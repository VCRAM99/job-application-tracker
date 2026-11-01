import "server-only"

import { accountingProof, accountingSecret } from "@/lib/ai/accounting"
import { decryptSecret, parseKeyRing } from "@/lib/ai/crypto"
import { managedAllowance, readPlatformKey } from "@/lib/ai/flags"
import type { ReservationRecord } from "@/lib/ai/gateway"
import { resolveExecutionMode } from "@/lib/ai/mode"
import { AiRequestError, AI_ERROR_MESSAGES, isProvider, isStoredMode, type ProviderId, type StoredExecutionMode } from "@/lib/ai/types"
import { analysisModelFor } from "@/lib/analyze/constants"
import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

export type AiRun = {
  provider: ProviderId
  model: string
  mode: StoredExecutionMode
  apiKey: string
  managedAllowed: boolean
  secret: string
}

export function asReservation(value: unknown): ReservationRecord {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const status = record.status
  if (status !== "reserved" && status !== "succeeded" && status !== "voided" && status !== "failed" && status !== "expired") {
    throw new AiRequestError("transient")
  }
  return { id: String(record.id), status, reused: Boolean(record.reused), reopened: Boolean(record.reopened) }
}

/** The caller's own unverified key for a provider, decrypted on the server. */
export async function readByokKey(supabase: Supabase, provider: string): Promise<string | null> {
  const summary = await supabase
    .from("ai_credential_summaries")
    .select("id, status")
    .eq("provider", provider)
    .eq("status", "unverified")
    .maybeSingle()
  if (summary.error || !summary.data) return null
  const material = await supabase.rpc("read_own_credential_material", { p_credential_id: summary.data.id })
  const row = Array.isArray(material.data) ? material.data[0] : null
  if (material.error || !row) return null
  const ring = parseKeyRing()
  if (!ring) throw new AiRequestError("encryption_unconfigured")
  return decryptSecret(
    { ciphertext: row.ciphertext, nonce: row.nonce, authTag: row.auth_tag, keyVersion: row.key_version },
    ring,
  )
}

/**
 * Resolves provider, fast model, execution mode, key, and accounting secret
 * for one AI run. The model comes from the job-analysis fast-model config.
 */
export async function prepareAiRun(
  supabase: Supabase,
  userId: string,
  requested: "managed" | "byok" | "local",
): Promise<{ ok: true; run: AiRun } | { ok: false; message: string }> {
  const settings = await supabase.from("ai_user_settings").select("execution_mode, provider").eq("user_id", userId).maybeSingle()
  if (settings.error || !settings.data) return { ok: false, message: AI_ERROR_MESSAGES.not_configured }
  const saved = isStoredMode(settings.data.execution_mode) ? settings.data.execution_mode : null
  const resolved = resolveExecutionMode(saved, requested)
  if (!resolved.ok) return { ok: false, message: AI_ERROR_MESSAGES[resolved.code] }
  const provider = settings.data.provider
  if (!provider || !isProvider(provider)) return { ok: false, message: AI_ERROR_MESSAGES.not_configured }
  let model: string
  try {
    model = analysisModelFor(provider)
  } catch {
    return { ok: false, message: "The configured fast model is not available." }
  }
  const allowance = managedAllowance()
  let apiKey: string | null
  try {
    apiKey = resolved.mode === "managed" ? (allowance.enabled ? readPlatformKey(provider) : null) : await readByokKey(supabase, provider)
  } catch (error) {
    return { ok: false, message: error instanceof AiRequestError ? error.message : AI_ERROR_MESSAGES.transient }
  }
  if (resolved.mode === "managed" && (!allowance.enabled || !apiKey)) return { ok: false, message: AI_ERROR_MESSAGES.managed_unconfigured }
  if (!apiKey) return { ok: false, message: AI_ERROR_MESSAGES.missing_credentials }
  const secret = accountingSecret()
  if (!secret) return { ok: false, message: AI_ERROR_MESSAGES.accounting_unconfigured }
  return {
    ok: true,
    run: {
      provider,
      model,
      mode: resolved.mode,
      apiKey,
      managedAllowed: allowance.enabled && Boolean(readPlatformKey(provider)),
      secret,
    },
  }
}

/** reserve, finalize, and void callbacks for withUsageReservation or generateStructured. */
export function usageReservationDeps(
  supabase: Supabase,
  input: { userId: string; secret: string; idempotencyKey: string; mode: StoredExecutionMode; provider: string; model: string },
) {
  const { userId, secret, idempotencyKey, mode, provider, model } = input
  return {
    reserve: async () => {
      const reserved = await supabase.rpc("reserve_ai_usage", {
        p_idempotency_key: idempotencyKey,
        p_execution_mode: mode,
        p_provider: provider,
        p_model: model,
        p_proof: accountingProof(secret, ["reserve", userId, idempotencyKey, mode, provider, model]),
      })
      if (reserved.error) throw new Error(reserved.error.message)
      return asReservation(reserved.data)
    },
    finalize: async (id: string, usage: { inputTokens: number | null; outputTokens: number | null }) => {
      const finalized = await supabase.rpc("finalize_ai_usage", {
        p_usage_event_id: id,
        p_input_tokens: usage.inputTokens,
        p_output_tokens: usage.outputTokens,
        p_estimated_cost_micros: null,
        p_proof: accountingProof(secret, ["finalize", userId, id, usage.inputTokens, usage.outputTokens]),
      })
      if (finalized.error) throw new AiRequestError("transient")
    },
    voidReservation: async (id: string, code: string) => {
      await supabase.rpc("void_ai_usage", {
        p_usage_event_id: id,
        p_error_class: code,
        p_proof: accountingProof(secret, ["void", userId, id, (code || "failed").slice(0, 80)]),
      })
    },
  }
}
