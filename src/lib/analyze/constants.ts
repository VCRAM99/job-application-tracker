import { assertSupportedModel, defaultModelFor, findModel } from "@/lib/ai/models"
import type { ProviderId } from "@/lib/ai/types"

export const PROMPT_VERSION = "job-fit-2026-11-11"
export const SCHEMA_VERSION = "job-fit-schema-1"
export const MAX_REQUIREMENTS = 40

const MODEL_ENV: Record<ProviderId, string> = {
  openai: "JOB_ANALYSIS_OPENAI_MODEL",
  anthropic: "JOB_ANALYSIS_ANTHROPIC_MODEL",
  google: "JOB_ANALYSIS_GOOGLE_MODEL",
}

/**
 * The model every AI feature uses for a user: the model chosen in Settings when it is in the
 * registry for that provider; otherwise the operator override (JOB_ANALYSIS_*_MODEL); otherwise
 * the registry default (src/lib/ai/models.ts). Throws for an unknown override.
 */
export function analysisModelFor(
  provider: ProviderId,
  env: Record<string, string | undefined> = process.env,
  chosen?: string | null,
): string {
  if (chosen && findModel(provider, chosen)) return chosen
  const configured = env[MODEL_ENV[provider]]?.trim()
  const model = configured || defaultModelFor(provider)
  assertSupportedModel(provider, model)
  return model
}

export function cacheIdentity(input: {
  userId: string
  jdHash: string
  profileFingerprint: string
  promptVersion?: string
}) {
  return {
    userId: input.userId,
    jdHash: input.jdHash,
    profileFingerprint: input.profileFingerprint,
    promptVersion: input.promptVersion ?? PROMPT_VERSION,
  }
}
