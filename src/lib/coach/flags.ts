import "server-only"

import { aiFeaturesEnabled } from "@/lib/ai/flags"

type Env = Record<string, string | undefined>

/** Interview & Networking Intelligence. Explicit "true" only, and only while career AI is enabled. Off when missing. */
export function careerCoachEnabled(env: Env = process.env): boolean {
  return env.CAREER_COACH_ENABLED?.trim().toLowerCase() === "true" && aiFeaturesEnabled(env)
}
