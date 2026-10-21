"use server"

import { revalidatePath } from "next/cache"

import { accountingProof, accountingSecret } from "@/lib/ai/accounting"
import { credentialShapeError, decryptSecret, encryptSecret, lastFour, parseKeyRing, sha256 } from "@/lib/ai/crypto"
import { EXTRACTION_JSON_SCHEMA, extractionSchema, factSchema, isFactType } from "@/lib/ai/extraction"
import { aiFeaturesEnabled, managedAllowance, readPlatformKey } from "@/lib/ai/flags"
import { generateStructured, type ReservationRecord } from "@/lib/ai/gateway"
import { assertSupportedModel } from "@/lib/ai/models"
import { resolveExecutionMode } from "@/lib/ai/mode"
import { EXTRACTION_SYSTEM_PROMPT, extractionUserMessage } from "@/lib/ai/prompt"
import { completeWithProvider } from "@/lib/ai/providers"
import { AiRequestError, AI_ERROR_MESSAGES, isProvider, isStoredMode } from "@/lib/ai/types"
import { planSuggestions } from "@/lib/career/logic"
import {
  arrangementsFrom,
  credentialFormSchema,
  parseTokenList,
  profileFormSchema,
  settingsFormSchema,
  sourceFormSchema,
} from "@/lib/career/schemas"
import { requireUser } from "@/lib/auth/session"
import { formText, isUuid, type RecordFormState } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

function fail(message: string): RecordFormState {
  return { status: "error", message, fieldErrors: {} }
}

function done(message: string): RecordFormState {
  return { status: "idle", message, fieldErrors: {} }
}

async function ready(): Promise<
  | { ok: false; message: string }
  | { ok: true; user: Awaited<ReturnType<typeof requireUser>>; supabase: Awaited<ReturnType<typeof createClient>> }
> {
  if (!aiFeaturesEnabled()) return { ok: false, message: AI_ERROR_MESSAGES.features_disabled }
  const user = await requireUser()
  const supabase = await createClient()
  return { ok: true, user, supabase }
}

export async function saveCareerProfile(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const parsed = profileFormSchema.safeParse({
    summary: formText(formData, "summary"),
    targetRoles: formText(formData, "targetRoles"),
    countries: formText(formData, "countries"),
    remote: formData.get("remote") === "on",
    hybrid: formData.get("hybrid") === "on",
    onsite: formData.get("onsite") === "on",
    salaryFloor: formText(formData, "salaryFloor"),
    salaryCurrency: formText(formData, "salaryCurrency").toUpperCase(),
  })
  if (!parsed.success) return fail("Check the profile and try again.")
  const roles = parseTokenList(parsed.data.targetRoles, /^[\p{L}\p{N} .&/+-]{1,80}$/u, 12)
  const countries = parseTokenList(parsed.data.countries.toUpperCase(), /^[A-Z]{2}$/, 12)
  if (!roles.ok) return fail("Enter up to 12 target roles, separated by commas.")
  if (!countries.ok) return fail("Enter country codes such as CA, US.")
  const salaryFloor = parsed.data.salaryFloor ? Number(parsed.data.salaryFloor) : null
  if (parsed.data.salaryFloor && (!Number.isFinite(salaryFloor) || (salaryFloor ?? 0) < 0)) {
    return fail("Enter a salary floor of zero or more, or leave it blank.")
  }
  const currency = parsed.data.salaryCurrency || "USD"
  const { error } = await context.supabase
    .from("career_profiles")
    .update({
      summary: parsed.data.summary || null,
      target_roles: roles.items,
      countries: countries.items,
      work_arrangements: arrangementsFrom(parsed.data),
      salary_floor: salaryFloor,
      salary_currency: currency,
    })
    .eq("user_id", context.user.id)
  if (error) return fail("The profile could not be saved.")
  revalidatePath("/career")
  return done("Profile saved.")
}

export async function createCareerSource(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const parsed = sourceFormSchema.safeParse({
    label: formText(formData, "label"),
    body: formText(formData, "body"),
  })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the resume text.")
  const profile = await context.supabase
    .from("career_profiles")
    .select("id")
    .eq("user_id", context.user.id)
    .maybeSingle()
  if (profile.error || !profile.data) return fail("Save a career profile before adding a resume.")
  const { error } = await context.supabase.from("career_sources").insert({
    user_id: context.user.id,
    profile_id: profile.data.id,
    label: parsed.data.label,
    body: parsed.data.body,
    sha256: sha256(parsed.data.body),
  })
  if (error) return fail("The resume text could not be saved.")
  revalidatePath("/career")
  return done("Resume source saved. Extraction will only propose facts until you accept them.")
}

export async function saveAiSettings(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const parsed = settingsFormSchema.safeParse({
    executionMode: formText(formData, "executionMode"),
    provider: formText(formData, "provider"),
    model: formText(formData, "model"),
  })
  if (!parsed.success) return fail("Choose a mode, provider, and model.")
  try {
    assertSupportedModel(parsed.data.provider, parsed.data.model)
  } catch {
    return fail(AI_ERROR_MESSAGES.unsupported_model)
  }
  const existing = await context.supabase
    .from("ai_user_settings")
    .select("id")
    .eq("user_id", context.user.id)
    .maybeSingle()
  const payload = {
    execution_mode: parsed.data.executionMode,
    provider: parsed.data.provider,
    model: parsed.data.model,
  }
  const write = existing.data
    ? context.supabase.from("ai_user_settings").update(payload).eq("user_id", context.user.id)
    : context.supabase.from("ai_user_settings").insert({ user_id: context.user.id, ...payload })
  const { error } = await write
  if (error) return fail("AI settings could not be saved.")
  revalidatePath("/settings")
  revalidatePath("/career")
  return done("AI settings saved. This does not verify a provider connection.")
}

export async function saveProviderCredential(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const parsed = credentialFormSchema.safeParse({
    provider: formText(formData, "provider"),
    secret: formText(formData, "secret"),
  })
  if (!parsed.success || !isProvider(parsed.data.provider)) return fail("Enter a provider key.")
  const shape = credentialShapeError(parsed.data.provider, parsed.data.secret)
  if (shape) return fail(shape)
  const ring = readRing()
  if (!ring) return fail(AI_ERROR_MESSAGES.encryption_unconfigured)
  const encrypted = encryptSecret(parsed.data.secret.trim(), ring)
  const { error } = await context.supabase.rpc("rotate_ai_credential", {
    p_provider: parsed.data.provider,
    p_key_version: encrypted.keyVersion,
    p_last_four: lastFour(parsed.data.secret),
    p_ciphertext: encrypted.ciphertext,
    p_nonce: encrypted.nonce,
    p_auth_tag: encrypted.authTag,
  })
  if (error) return fail("The key could not be saved.")
  revalidatePath("/settings")
  return done("Key saved. It is unverified until a live check is explicitly enabled.")
}

export async function revokeProviderCredential(formData: FormData): Promise<void> {
  const context = await ready()
  if (!context.ok) return
  const id = formText(formData, "credentialId")
  if (!isUuid(id)) return
  await context.supabase.rpc("revoke_ai_credential", { p_credential_id: id })
  revalidatePath("/settings")
}

export async function supersedeCareerFact(formData: FormData): Promise<void> {
  const context = await ready()
  if (!context.ok) return
  const id = formText(formData, "factId")
  const table = formText(formData, "factTable")
  if (!isUuid(id)) return
  await context.supabase.rpc("supersede_career_fact", { p_table: table, p_fact_id: id })
  revalidatePath("/career")
}

export async function rejectCareerSuggestion(formData: FormData): Promise<void> {
  const context = await ready()
  if (!context.ok) return
  const id = formText(formData, "suggestionId")
  if (!isUuid(id)) return
  await context.supabase.rpc("reject_career_suggestion", { p_suggestion_id: id })
  revalidatePath("/career")
}

export async function acceptCareerSuggestion(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const id = formText(formData, "suggestionId")
  const factType = formText(formData, "factType")
  if (!isUuid(id) || !isFactType(factType)) return fail("That suggestion is no longer available.")
  const payload = payloadFromForm(factType, formData)
  const parsed = factSchema(factType).safeParse(payload)
  if (!parsed.success) return fail("Check the suggestion and try again. Only this item will be verified.")
  const { error } = await context.supabase.rpc("accept_career_suggestion", {
    p_suggestion_id: id,
    p_payload: parsed.data,
  })
  if (error) return fail("The suggestion could not be verified.")
  revalidatePath("/career")
  return done("Verified. Other suggestions are unchanged.")
}

export async function addManualFact(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const factType = formText(formData, "factType")
  if (!isFactType(factType)) return fail("Choose a fact type.")
  const payload = {
    ...payloadFromForm(factType, formData),
    evidence: formText(formData, "evidence") || "Added manually.",
  }
  const parsed = factSchema(factType).safeParse(payload)
  if (!parsed.success) return fail("Check the fact and try again.")
  const profile = await context.supabase
    .from("career_profiles")
    .select("id")
    .eq("user_id", context.user.id)
    .maybeSingle()
  if (!profile.data) return fail("The career profile is not available yet.")
  const row = manualRow(factType, parsed.data as Record<string, unknown>, profile.data.id)
  const facts = context.supabase as unknown as {
    from: (table: string) => {
      insert: (value: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
    }
  }
  const { error } = await facts.from(tableFor(factType)).insert(row)
  if (error) return fail("The fact could not be saved.")
  revalidatePath("/career")
  return done("Verified fact added.")
}

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

function readRing() {
  try {
    return parseKeyRing()
  } catch {
    return null
  }
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

function asReservation(value: unknown): ReservationRecord {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const status = record.status
  if (
    status !== "reserved" &&
    status !== "succeeded" &&
    status !== "voided" &&
    status !== "failed" &&
    status !== "expired"
  ) {
    throw new AiRequestError("transient")
  }
  return {
    id: String(record.id),
    status,
    reused: Boolean(record.reused),
    reopened: Boolean(record.reopened),
  }
}

function payloadFromForm(factType: string, formData: FormData) {
  const evidence = formText(formData, "evidence")
  const startDate = formText(formData, "startDate") || null
  const endDate = formText(formData, "endDate") || null
  if (factType === "employment") {
    return {
      organization: formText(formData, "secondary"),
      title: formText(formData, "primary"),
      location: formText(formData, "location") || null,
      startDate,
      endDate,
      current: formData.get("current") === "on",
      summary: formText(formData, "summary") || null,
      evidence,
    }
  }
  if (factType === "education") {
    return {
      institution: formText(formData, "secondary"),
      credential: formText(formData, "primary"),
      fieldOfStudy: formText(formData, "summary") || null,
      startDate,
      endDate,
      summary: null,
      evidence,
    }
  }
  if (factType === "skill") {
    return {
      name: formText(formData, "primary"),
      category: formText(formData, "secondary") || null,
      evidence,
    }
  }
  if (factType === "project") {
    return {
      name: formText(formData, "primary"),
      roleTitle: formText(formData, "secondary") || null,
      url: formText(formData, "url") || null,
      summary: formText(formData, "summary") || null,
      evidence,
    }
  }
  if (factType === "accomplishment") {
    return {
      title: formText(formData, "primary"),
      summary: formText(formData, "summary") || null,
      evidence,
    }
  }
  return {
    name: formText(formData, "primary"),
    issuer: formText(formData, "secondary") || null,
    issuedOn: startDate,
    expiresOn: endDate,
    credentialUrl: formText(formData, "url") || null,
    evidence,
  }
}

function tableFor(factType: string): string {
  if (factType === "employment") return "employment_entries"
  if (factType === "education") return "education_entries"
  if (factType === "skill") return "skill_entries"
  if (factType === "project") return "project_entries"
  if (factType === "accomplishment") return "accomplishment_entries"
  return "certification_entries"
}

function manualRow(factType: string, payload: Record<string, unknown>, profileId: string) {
  const shared = {
    profile_id: profileId,
    verification_state: "user_verified",
    approved_at: new Date().toISOString(),
    evidence_excerpt: payload.evidence ?? null,
  }
  if (factType === "employment") {
    return {
      ...shared,
      organization: payload.organization,
      title: payload.title,
      location: payload.location,
      start_date: payload.startDate,
      end_date: payload.endDate,
      is_current: payload.current,
      summary: payload.summary,
    }
  }
  if (factType === "education") {
    return {
      ...shared,
      institution: payload.institution,
      credential: payload.credential,
      field_of_study: payload.fieldOfStudy,
      start_date: payload.startDate,
      end_date: payload.endDate,
      summary: payload.summary,
    }
  }
  if (factType === "skill") {
    return { ...shared, name: payload.name, category: payload.category }
  }
  if (factType === "project") {
    return {
      ...shared,
      name: payload.name,
      role_title: payload.roleTitle,
      url: payload.url,
      summary: payload.summary,
    }
  }
  if (factType === "accomplishment") {
    return { ...shared, title: payload.title, summary: payload.summary }
  }
  return {
    ...shared,
    name: payload.name,
    issuer: payload.issuer,
    issued_on: payload.issuedOn,
    expires_on: payload.expiresOn,
    credential_url: payload.credentialUrl,
  }
}
