import type { EmailOtpType } from "@supabase/supabase-js"

import { safeNextPath } from "@/lib/auth/paths"

const EMAIL_VERIFY_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "email_change",
  "email",
])

export type ConfirmDecision =
  | { kind: "expired" }
  | { kind: "forward-recovery"; tokenHash: string }
  | { kind: "verify-email"; tokenHash: string; type: EmailOtpType; next: string }
  | { kind: "exchange-code"; code: string; next: string }

export function decideConfirm(searchParams: URLSearchParams): ConfirmDecision {
  if (searchParams.get("error") || searchParams.get("error_code")) {
    return { kind: "expired" }
  }

  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const code = searchParams.get("code")
  const next = safeNextPath(searchParams.get("next"))

  if (type === "recovery") {
    if (!tokenHash) return { kind: "expired" }
    return { kind: "forward-recovery", tokenHash }
  }

  if (tokenHash && type && EMAIL_VERIFY_TYPES.has(type as EmailOtpType)) {
    return {
      kind: "verify-email",
      tokenHash,
      type: type as EmailOtpType,
      next,
    }
  }

  if (code) {
    return { kind: "exchange-code", code, next }
  }

  return { kind: "expired" }
}
