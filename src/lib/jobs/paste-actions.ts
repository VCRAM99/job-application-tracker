"use server"

import { prepareAiRun, usageReservationDeps } from "@/lib/ai/run-context"
import { generateStructured } from "@/lib/ai/gateway"
import { AI_ERROR_MESSAGES, AiRequestError } from "@/lib/ai/types"
import { validateJobDescription } from "@/lib/analyze/text"
import { requireUser } from "@/lib/auth/session"
import { analyzeAllowed } from "@/lib/beta"
import { idempotencyKey, requestedMode, requestNonce } from "@/lib/coach/action-utils"
import { completeWithProvider } from "@/lib/ai/providers"
import {
  groundImport,
  IMPORT_JSON_SCHEMA,
  IMPORT_PROMPT_VERSION,
  IMPORT_SCHEMA_NAME,
  IMPORT_SYSTEM_PROMPT,
  importOutputSchema,
  importPrefill,
  importUserMessage,
  pastedUrl,
  type RawImport,
} from "@/lib/jobs/paste-import"
import type { TrackerPrefill } from "@/lib/jobs/prefill"
import { createClient } from "@/lib/supabase/server"

export type PasteImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; prefill: TrackerPrefill & { company: string }; filled: number; dropped: number; text: string; model: string }

const MAX_POSTING_CHARS = 30_000

/**
 * Proposes application fields from a pasted job posting. Behind the AI and fit-analysis flags and
 * the beta list, BYOK through the M1 gateway (rate limit, usage accounting). It saves nothing:
 * the grounded fields come back to prefill the normal Add application form. The copied URL is
 * only checked to be http(s) and kept as text; it is never fetched.
 */
export async function importPastedPosting(_previous: PasteImportState, formData: FormData): Promise<PasteImportState> {
  if (!(await analyzeAllowed())) return { status: "error", message: AI_ERROR_MESSAGES.features_disabled }
  const user = await requireUser()
  const raw = formData.get("postingText")
  const validated = validateJobDescription(typeof raw === "string" ? raw.slice(0, MAX_POSTING_CHARS + 1) : "")
  if (!validated.ok) return { status: "error", message: validated.message }
  if (validated.text.length > MAX_POSTING_CHARS) return { status: "error", message: "Paste at most 30,000 characters of the posting." }
  const urlInput = formData.get("postingUrl")
  const url = pastedUrl(typeof urlInput === "string" ? urlInput : "")
  if (typeof urlInput === "string" && urlInput.trim() && !url) return { status: "error", message: "The copied link must start with https:// or http://." }

  const supabase = await createClient()
  const prepared = await prepareAiRun(supabase, user.id, requestedMode(formData))
  if (!prepared.ok) return { status: "error", message: prepared.message }
  const { run } = prepared
  const key = idempotencyKey(["job-import", user.id, validated.text, IMPORT_PROMPT_VERSION, run.mode, run.provider, run.model, requestNonce(formData)])

  let grounded: ReturnType<typeof groundImport> | null = null
  let answeredBy = run.model
  const result = await generateStructured<RawImport>(
    {
      mode: run.mode,
      provider: run.provider,
      model: run.model,
      apiKey: run.apiKey,
      managedAllowed: run.managedAllowed,
      schema: importOutputSchema,
      system: IMPORT_SYSTEM_PROMPT,
      user: importUserMessage(validated.text),
    },
    {
      ...usageReservationDeps(supabase, { userId: user.id, secret: run.secret, idempotencyKey: key, mode: run.mode, provider: run.provider, model: run.model }),
      complete: (message) =>
        completeWithProvider(run.provider, {
          apiKey: run.apiKey,
          model: run.model,
          system: IMPORT_SYSTEM_PROMPT,
          user: message,
          schemaName: IMPORT_SCHEMA_NAME,
          jsonSchema: IMPORT_JSON_SCHEMA,
          thinking: "low",
        }),
      // Nothing is stored: grounding runs here and the fields go back to the form.
      persist: async (data, _usageEventId, modelUsed) => {
        grounded = groundImport(validated.text, data)
        answeredBy = modelUsed
      },
    },
  )
  if (!result.ok) {
    if (result.code === "in_progress") return { status: "error", message: "This posting is already being read. Wait a moment, then try again." }
    return { status: "error", message: AI_ERROR_MESSAGES[result.code] ?? result.message }
  }
  // A repeated submit of the same form (same nonce) finds the finished reservation and no output.
  if (result.kind === "already-complete") return { status: "error", message: "This posting was already read. Paste it again to read it once more." }
  const outcome = grounded as ReturnType<typeof groundImport> | null
  if (!outcome) throw new AiRequestError("transient")
  const prefill = importPrefill(outcome.fields, url)
  const filled = Object.values(outcome.fields).filter((value) => value !== null && value !== "unknown").length
  return { status: "ready", prefill, filled, dropped: outcome.dropped, text: validated.text, model: answeredBy }
}
