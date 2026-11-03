"use server"

import { revalidatePath } from "next/cache"

import { accountingProof, accountingSecret } from "@/lib/ai/accounting"
import { decryptSecret, sha256 } from "@/lib/ai/crypto"
import { EXTRACTION_JSON_SCHEMA, extractionSchema } from "@/lib/ai/extraction"
import { managedAllowance, providerEnabled, readPlatformKey } from "@/lib/ai/flags"
import { generateStructured } from "@/lib/ai/gateway"
import { resolveExecutionMode } from "@/lib/ai/mode"
import { assertSupportedModel } from "@/lib/ai/models"
import { EXTRACTION_SYSTEM_PROMPT, extractionUserMessage } from "@/lib/ai/prompt"
import { completeWithProvider } from "@/lib/ai/providers"
import { checkAiRateLimit } from "@/lib/ai/rate-limit"
import { asReservation } from "@/lib/ai/run-context"
import { AiRequestError, AI_ERROR_MESSAGES, isProvider, isStoredMode } from "@/lib/ai/types"
import { done, fail, readRing, ready } from "@/lib/career/action-utils"
import { planSuggestions } from "@/lib/career/logic"
import { formText, isUuid, type RecordFormState } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

export async function extractCareerFacts(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const sourceId = formText(formData, "sourceId")
  const requested = formText(formData, "executionMode")
  if (!isUuid(sourceId) || !isStoredMode(requested) && requested !== "local") {
    return fail("Choose a saved resume source.")
  }
  const settingsResult = await context.supabase
    .from("ai_user_settings")
    .select("execution_mode, provider, model")
    .eq("user_id", context.user.id)
    .maybeSingle()
  if (settingsResult.error || !settingsResult.data) return fail(AI_ERROR_MESSAGES.not_configured)
  const savedMode = isStoredMode(settingsResult.data.execution_mode)
    ? settingsResult.data.execution_mode
    : null
  const resolved = resolveExecutionMode(savedMode, requested === "local" ? "local" : requested)
  if (!resolved.ok) return fail(AI_ERROR_MESSAGES[resolved.code])
  const provider = settingsResult.data.provider
  const model = settingsResult.data.model
  if (!provider || !isProvider(provider) || !model) return fail(AI_ERROR_MESSAGES.not_configured)
  if (!providerEnabled(provider)) return fail(AI_ERROR_MESSAGES.provider_disabled)
  try {
    assertSupportedModel(provider, model)
  } catch {
    return fail(AI_ERROR_MESSAGES.unsupported_model)
  }

  const source = await context.supabase
    .from("career_sources")
    .select("id, body")
    .eq("user_id", context.user.id)
    .eq("id", sourceId)
    .maybeSingle()
  if (source.error || !source.data) return fail("That resume source is not available.")

  const allowance = managedAllowance()
  let apiKey: string | null = null
  const limited = await checkAiRateLimit(context.supabase, context.user.id)
  if (!limited.ok) return fail(AI_ERROR_MESSAGES.ai_rate_limited)
  try {
    apiKey =
      resolved.mode === "managed"
        ? allowance.enabled
          ? readPlatformKey(provider)
          : null
        : await byokKey(context.supabase, provider)
  } catch (error) {
    if (error instanceof AiRequestError) return fail(error.message)
    return fail(AI_ERROR_MESSAGES.transient)
  }
  if (resolved.mode === "managed" && (!allowance.enabled || !apiKey)) {
    return fail(AI_ERROR_MESSAGES.managed_unconfigured)
  }
  if (resolved.mode === "byok" && !apiKey) return fail(AI_ERROR_MESSAGES.missing_credentials)
  const secret = accountingSecret()
  if (!secret) return fail(AI_ERROR_MESSAGES.accounting_unconfigured)

  const idempotencyKey = sha256(
    `${context.user.id}\n${sourceId}\n${sha256(source.data.body)}\n${provider}\n${model}\n${resolved.mode}`,
  )
  const userMessage = extractionUserMessage(source.data.body)
  const result = await generateStructured(
    {
      mode: resolved.mode,
      provider,
      model,
      apiKey,
      managedAllowed: allowance.enabled && Boolean(readPlatformKey(provider)),
      schema: extractionSchema,
      system: EXTRACTION_SYSTEM_PROMPT,
      user: userMessage,
    },
    {
      reserve: async () => {
        const reserved = await context.supabase.rpc("reserve_ai_usage", {
          p_idempotency_key: idempotencyKey,
          p_execution_mode: resolved.mode,
          p_provider: provider,
          p_model: model,
          p_proof: accountingProof(secret, [
            "reserve",
            context.user.id,
            idempotencyKey,
            resolved.mode,
            provider,
            model,
          ]),
        })
        if (reserved.error) throw new Error(reserved.error.message)
        return asReservation(reserved.data)
      },
      finalize: async (id, usage) => {
        const finalized = await context.supabase.rpc("finalize_ai_usage", {
          p_usage_event_id: id,
          p_input_tokens: usage.inputTokens,
          p_output_tokens: usage.outputTokens,
          p_estimated_cost_micros: null,
          p_proof: accountingProof(secret, [
            "finalize",
            context.user.id,
            id,
            usage.inputTokens,
            usage.outputTokens,
          ]),
        })
        if (finalized.error) throw new AiRequestError("transient")
      },
      voidReservation: async (id, code) => {
        await context.supabase.rpc("void_ai_usage", {
          p_usage_event_id: id,
          p_error_class: code,
          p_proof: accountingProof(secret, [
            "void",
            context.user.id,
            id,
            (code || "failed").slice(0, 80),
          ]),
        })
      },
      complete: (nextUser) => completeWithProvider(provider, {
        apiKey: apiKey ?? "",
        model,
        system: EXTRACTION_SYSTEM_PROMPT,
        user: nextUser,
        schemaName: "career_extraction",
        jsonSchema: EXTRACTION_JSON_SCHEMA,
      }),
      persist: async (data, usageEventId) => {
        const planned = planSuggestions(sourceId, data)
        const itemsText = JSON.stringify(
          planned.map((item) => ({
            fact_type: item.factType,
            payload: item.payload,
            evidence_excerpt: item.evidenceExcerpt,
            dedupe_key: item.dedupeKey,
          })),
        )
        const requestHash = sha256(EXTRACTION_SYSTEM_PROMPT + "\n" + userMessage)
        const inserted = await context.supabase.rpc("insert_career_suggestions", {
          p_usage_event_id: usageEventId,
          p_source_id: sourceId,
          p_items_text: itemsText,
          p_proof: accountingProof(secret, [
            "suggestions",
            context.user.id,
            usageEventId,
            sourceId,
            itemsText,
          ]),
        })
        if (inserted.error) throw new AiRequestError("transient")
        await context.supabase.rpc("record_ai_audit", {
          p_usage_event_id: usageEventId,
          p_action: "extract_career_facts",
          p_schema_name: "career_extraction",
          p_provider: provider,
          p_model: model,
          p_status: "suggested",
          p_error_class: null,
          p_request_hash: requestHash,
          p_proof: accountingProof(secret, [
            "audit",
            context.user.id,
            usageEventId,
            "extract_career_facts",
            requestHash,
          ]),
        })
      },
    },
  )

  revalidatePath("/career")
  if (!result.ok) return fail(result.message)
  if (result.kind === "already-complete") {
    return done("Suggestions from this resume and model are already saved. Review them below.")
  }
  return done("Suggestions are ready. Nothing becomes verified until you accept each one.")
}

async function byokKey(
  supabase: Awaited<ReturnType<typeof createClient>>,
  provider: string,
): Promise<string | null> {
  const summary = await supabase
    .from("ai_credential_summaries")
    .select("id, status")
    .eq("provider", provider)
    .eq("status", "unverified")
    .maybeSingle()
  if (summary.error || !summary.data) return null
  const material = await supabase.rpc("read_own_credential_material", {
    p_credential_id: summary.data.id,
  })
  const row = Array.isArray(material.data) ? material.data[0] : null
  if (material.error || !row) return null
  const ring = readRing()
  if (!ring) throw new AiRequestError("encryption_unconfigured")
  return decryptSecret(
    {
      ciphertext: row.ciphertext,
      nonce: row.nonce,
      authTag: row.auth_tag,
      keyVersion: row.key_version,
    },
    ring,
  )
}
