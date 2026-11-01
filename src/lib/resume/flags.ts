import "server-only"

import { aiFeaturesEnabled } from "@/lib/ai/flags"

type Env = Record<string, string | undefined>

/** AI Resume Studio. Explicit "true" only, and only while career AI is enabled. Off when missing. */
export function resumeStudioEnabled(env: Env = process.env): boolean {
  return env.RESUME_STUDIO_ENABLED?.trim().toLowerCase() === "true" && aiFeaturesEnabled(env)
}
