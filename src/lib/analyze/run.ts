import "server-only"

import { accountingProof, accountingSecret } from "@/lib/ai/accounting"
import { decryptSecret, parseKeyRing } from "@/lib/ai/crypto"
import { jobAnalysisEnabled, jobAnalysisMockProvider, managedAllowance, readPlatformKey } from "@/lib/ai/flags"
import { withUsageReservation, type ReservationRecord } from "@/lib/ai/gateway"
import { resolveExecutionMode } from "@/lib/ai/mode"
import { analysisModelFor, PROMPT_VERSION } from "@/lib/analyze/constants"
import {
  findCachedAnalysis,
  fingerprintOf,
  insertAnalysis,
  loadVerifiedFacts,
} from "@/lib/analyze/data"
import { executeAnalysis } from "@/lib/analyze/execute"
import { sha256 } from "@/lib/analyze/hash"
import { mockStructuredResponse } from "@/lib/analyze/mock"
import { validateJobDescription } from "@/lib/analyze/text"
import { completeWithProvider } from "@/lib/ai/providers"
import { AiRequestError, AI_ERROR_MESSAGES, isProvider, isStoredMode, type AiErrorCode } from "@/lib/ai/types"
import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export type AnalysisRunInput = {
  jdText: string
  title: string | null
  company: string | null
  executionMode: "managed" | "byok" | "local"
  source: "posting" | "pasted" | "application"
  postingId: string | null
  applicationId: string | null
  resumeSourceId: string | null
}

export type AnalysisRunResult =
  | { ok: true; id: string; reused: boolean }
  | { ok: false; message: string }

function asReservation(value: unknown): ReservationRecord {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const status = record.status
  if (status !== "reserved" && status !== "succeeded" && status !== "voided" && status !== "failed" && status !== "expired") {
    throw new AiRequestError("transient")
  }
  return { id: String(record.id), status, reused: Boolean(record.reused), reopened: Boolean(record.reopened) }
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

export async function runJobAnalysis(input: AnalysisRunInput): Promise<AnalysisRunResult> {
  if (!jobAnalysisEnabled()) return { ok: false, message: AI_ERROR_MESSAGES.features_disabled }
  const validated = validateJobDescription(input.jdText)
  if (!validated.ok) return { ok: false, message: validated.message }
  const user = await requireUser()
  const supabase = await createClient()
  const settingsResult = await supabase
    .from("ai_user_settings")
    .select("execution_mode, provider, model")
    .eq("user_id", user.id)
    .maybeSingle()
  if (settingsResult.error || !settingsResult.data) return { ok: false, message: AI_ERROR_MESSAGES.not_configured }
  const savedMode = isStoredMode(settingsResult.data.execution_mode) ? settingsResult.data.execution_mode : null
  const resolved = resolveExecutionMode(savedMode, input.executionMode)
  if (!resolved.ok) return { ok: false, message: AI_ERROR_MESSAGES[resolved.code] }
  const provider = settingsResult.data.provider
  if (!provider || !isProvider(provider)) return { ok: false, message: AI_ERROR_MESSAGES.not_configured }
  let model: string
  try {
    model = analysisModelFor(provider)
  } catch (error) {
    if (error instanceof AiRequestError) return { ok: false, message: "The configured job analysis model is not available." }
    return { ok: false, message: AI_ERROR_MESSAGES.unsupported_model }
  }

  const facts = await loadVerifiedFacts()
  if (!facts.ok) return { ok: false, message: "Verified career facts could not be loaded." }
  const fingerprint = fingerprintOf(facts.facts)
  const jdHash = sha256(validated.text)
  const cached = await findCachedAnalysis({ jdHash, profileFingerprint: fingerprint })
  if (cached) return { ok: true, id: cached, reused: true }

  let resume: { sourceId: string; text: string } | null = null
  if (input.resumeSourceId) {
    const source = await supabase
      .from("career_sources")
      .select("id, body")
      .eq("id", input.resumeSourceId)
      .maybeSingle()
    if (source.error || !source.data) return { ok: false, message: "That resume source is not available." }
    resume = { sourceId: source.data.id, text: source.data.body }
  }

  const mock = jobAnalysisMockProvider()
  const allowance = managedAllowance()
  let apiKey: string | null = null
  if (!mock) {
    try {
      apiKey = resolved.mode === "managed" ? (allowance.enabled ? readPlatformKey(provider) : null) : await byokKey(supabase, provider)
    } catch (error) {
      if (error instanceof AiRequestError) return { ok: false, message: error.message }
      return { ok: false, message: AI_ERROR_MESSAGES.transient }
    }
    if (resolved.mode === "managed" && (!allowance.enabled || !apiKey)) {
      return { ok: false, message: AI_ERROR_MESSAGES.managed_unconfigured }
    }
    if (resolved.mode === "byok" && !apiKey) return { ok: false, message: AI_ERROR_MESSAGES.missing_credentials }
  }

  const storedBase = {
    source: input.source,
    postingId: input.source === "posting" ? input.postingId : null,
    applicationId: input.source === "application" ? input.applicationId : null,
    resumeSourceId: input.resumeSourceId,
    title: input.title,
    company: input.company,
    jdText: validated.text,
    jdHash,
    profileFingerprint: fingerprint,
    provider,
    model,
    executionMode: resolved.mode,
  }

  const produce = () =>
    executeAnalysis({
      jdText: validated.text,
      facts: facts.facts,
      resume,
      model,
      complete: mock
        ? async (request) => mockStructuredResponse(request)
        : (request) =>
            completeWithProvider(provider, {
              ...request,
              apiKey: apiKey ?? "",
            }),
    })

  if (mock) {
    try {
      const produced = await produce()
      const inserted = await insertAnalysis({ ...storedBase, analysis: produced.analysis })
      if (!inserted.ok) return { ok: false, message: "The analysis could not be saved." }
      return { ok: true, id: inserted.id, reused: false }
    } catch (error) {
      const ai = error instanceof AiRequestError ? error : new AiRequestError("transient")
      return { ok: false, message: ai.message }
    }
  }

  const secret = accountingSecret()
  if (!secret) return { ok: false, message: AI_ERROR_MESSAGES.accounting_unconfigured }
  const idempotencyKey = sha256(
    [user.id, jdHash, fingerprint, PROMPT_VERSION, resolved.mode, provider, model].join("\n"),
  )
  const result = await withUsageReservation(
    {
      mode: resolved.mode,
      provider,
      model,
      apiKey,
      managedAllowed: allowance.enabled && Boolean(readPlatformKey(provider)),
    },
    {
      reserve: async () => {
        const reserved = await supabase.rpc("reserve_ai_usage", {
          p_idempotency_key: idempotencyKey,
          p_execution_mode: resolved.mode,
          p_provider: provider,
          p_model: model,
          p_proof: accountingProof(secret, ["reserve", user.id, idempotencyKey, resolved.mode, provider, model]),
        })
        if (reserved.error) throw new Error(reserved.error.message)
        return asReservation(reserved.data)
      },
      finalize: async (id, usage) => {
        const finalized = await supabase.rpc("finalize_ai_usage", {
          p_usage_event_id: id,
          p_input_tokens: usage.inputTokens,
          p_output_tokens: usage.outputTokens,
          p_estimated_cost_micros: null,
          p_proof: accountingProof(secret, ["finalize", user.id, id, usage.inputTokens, usage.outputTokens]),
        })
        if (finalized.error) throw new AiRequestError("transient")
      },
      voidReservation: async (id, code) => {
        await supabase.rpc("void_ai_usage", {
          p_usage_event_id: id,
          p_error_class: code,
          p_proof: accountingProof(secret, ["void", user.id, id, (code || "failed").slice(0, 80)]),
        })
      },
    },
    async () => {
      try {
        const produced = await produce()
        const inserted = await insertAnalysis({ ...storedBase, analysis: produced.analysis })
        if (!inserted.ok) throw new AiRequestError("transient")
        return { data: inserted.id, usage: produced.usage }
      } catch (error) {
        const ai = error instanceof AiRequestError ? error : new AiRequestError("transient")
        await insertAnalysis({
          ...storedBase,
          analysis: emptyAnalysis(validated.text),
          status: "failed",
          errorCode: ai.code,
        }).catch(() => undefined)
        throw ai
      }
    },
  )

  if (!result.ok) return { ok: false, message: messageFor(result.code) }
  if (result.kind === "already-complete") {
    const again = await findCachedAnalysis({ jdHash, profileFingerprint: fingerprint })
    if (!again) return { ok: false, message: "This analysis already finished. Refresh the history list." }
    return { ok: true, id: again, reused: true }
  }
  return { ok: true, id: result.data, reused: false }
}

function messageFor(code: AiErrorCode): string {
  return AI_ERROR_MESSAGES[code]
}

function emptyAnalysis(jdText: string): {
  normalizedJd: string
  requirements: []
  matches: []
  blockers: []
  droppedRequirementCount: number
  score: null
  scoreBreakdown: {
    score: null
    weightedSum: number
    weightedMax: number
    coverageConfidence: null
    scorableCount: number
    unclearCount: number
  }
  readability: null
} {
  return {
    normalizedJd: jdText,
    requirements: [],
    matches: [],
    blockers: [],
    droppedRequirementCount: 0,
    score: null,
    scoreBreakdown: {
      score: null,
      weightedSum: 0,
      weightedMax: 0,
      coverageConfidence: null,
      scorableCount: 0,
      unclearCount: 0,
    },
    readability: null,
  }
}
