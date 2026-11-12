import "server-only"

import { requireUser } from "@/lib/auth/session"
import { managedOffered } from "@/lib/ai/flags"
import { createClient } from "@/lib/supabase/server"

/** The execution mode saved in AI settings, for the paste-a-job form ("Your key" unless managed is saved and offered). */
export async function savedExecutionMode(): Promise<"byok" | "managed"> {
  const user = await requireUser()
  const supabase = await createClient()
  const settings = await supabase.from("ai_user_settings").select("execution_mode").eq("user_id", user.id).maybeSingle()
  return settings.data?.execution_mode === "managed" && managedOffered() ? "managed" : "byok"
}
