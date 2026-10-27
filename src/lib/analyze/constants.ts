import { assertSupportedModel } from "@/lib/ai/models"
import type { ProviderId } from "@/lib/ai/types"

export const PROMPT_VERSION = "job-fit-2026-10-23"
export const SCHEMA_VERSION = "job-fit-schema-1"
export const MAX_REQUIREMENTS = 40

const FAST_MODELS: Record<ProviderId, string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-haiku-5-5",
  google: "gemini-3.8-flash",
}

const MODEL_ENV: Record<ProviderId, string> = {
  openai: "JOB_ANALYSIS_OPENAI_MODEL",
  anthropic: "JOB_ANALYSIS_ANTHROPIC_MODEL",
  google: "JOB_ANALYSIS_GOOGLE_MODEL",
}

export function analysisModelFor(
  provider: ProviderId,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env[MODEL_ENV[provider]]?.trim()
  const model = configured || FAST_MODELS[provider]
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
