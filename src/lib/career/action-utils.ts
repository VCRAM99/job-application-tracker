import "server-only"

import { parseKeyRing } from "@/lib/ai/crypto"
import { aiFeaturesEnabled } from "@/lib/ai/flags"
import { AI_ERROR_MESSAGES } from "@/lib/ai/types"
import { requireUser } from "@/lib/auth/session"
import type { RecordFormState } from "@/lib/records/form-state"
import { createClient } from "@/lib/supabase/server"

/** Shared by the career server actions. Not a server action module itself. */
export function fail(message: string): RecordFormState {
  return { status: "error", message, fieldErrors: {} }
}

export function done(message: string): RecordFormState {
  return { status: "idle", message, fieldErrors: {} }
}

export async function ready(): Promise<
  | { ok: false; message: string }
  | { ok: true; user: Awaited<ReturnType<typeof requireUser>>; supabase: Awaited<ReturnType<typeof createClient>> }
> {
  if (!aiFeaturesEnabled()) return { ok: false, message: AI_ERROR_MESSAGES.features_disabled }
  const user = await requireUser()
  const supabase = await createClient()
  return { ok: true, user, supabase }
}

/** The credential key ring, or null when it is missing or malformed. */
export function readRing() {
  try {
    return parseKeyRing()
  } catch {
    return null
  }
}
