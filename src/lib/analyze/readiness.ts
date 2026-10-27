import "server-only"

import { accountingSecret } from "@/lib/ai/accounting"
import { credentialConfigError } from "@/lib/ai/crypto"

type Env = Record<string, string | undefined>

/**
 * Says why the Analyze button cannot run yet, or null when it can. The job
 * description stays editable either way. Managed availability is checked when
 * the run starts because the user picks the mode on the form.
 */
export function analysisBlockedReason(
  input: {
    settings: { executionMode: "managed" | "byok"; provider: string } | null
    hasByokKey: boolean
    mockProvider: boolean
  },
  env: Env = process.env,
): string | null {
  if (!input.settings) return "Save a provider and an execution mode in Settings before running a qualification match."
  if (input.mockProvider) return null
  if (!accountingSecret(env)) return "Set AI_ACCOUNTING_SECRET on the server before running AI."
  if (input.settings.executionMode === "byok") {
    const keyError = credentialConfigError(env)
    if (keyError) return keyError
    if (!input.hasByokKey) return "Save a key for the selected provider in Settings before running AI."
  }
  return null
}
