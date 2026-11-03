"use server"

import { revalidatePath } from "next/cache"

import { credentialConfigError, credentialShapeError, encryptSecret, lastFour } from "@/lib/ai/crypto"
import { assertSupportedModel } from "@/lib/ai/models"
import { managedOffered, providerEnabled } from "@/lib/ai/flags"
import { AI_ERROR_MESSAGES, isProvider } from "@/lib/ai/types"
import { done, fail, readRing, ready } from "@/lib/career/action-utils"
import { credentialFormSchema, settingsFormSchema } from "@/lib/career/schemas"
import { formText, isUuid, type RecordFormState } from "@/lib/records/form-state"

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
  if (!providerEnabled(parsed.data.provider)) return fail(AI_ERROR_MESSAGES.provider_disabled)
  if (parsed.data.executionMode === "managed" && !managedOffered()) return fail(AI_ERROR_MESSAGES.managed_unconfigured)
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
  if (!providerEnabled(parsed.data.provider)) return fail(AI_ERROR_MESSAGES.provider_disabled)
  const shape = credentialShapeError(parsed.data.provider, parsed.data.secret)
  if (shape) return fail(shape)
  const configError = credentialConfigError()
  const ring = configError ? null : readRing()
  if (!ring) {
    console.error(`Provider key not saved: ${configError ?? AI_ERROR_MESSAGES.encryption_unconfigured}`)
    return fail(configError ?? AI_ERROR_MESSAGES.encryption_unconfigured)
  }
  const encrypted = encryptSecret(parsed.data.secret.trim(), ring)
  const { error } = await context.supabase.rpc("rotate_ai_credential", {
    p_provider: parsed.data.provider,
    p_key_version: encrypted.keyVersion,
    p_last_four: lastFour(parsed.data.secret),
    p_ciphertext: encrypted.ciphertext,
    p_nonce: encrypted.nonce,
    p_auth_tag: encrypted.authTag,
  })
  if (error) {
    console.error(`Provider key not saved: rotate_ai_credential failed (${error.code ?? "no code"}).`)
    return fail("The key could not be saved.")
  }
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
