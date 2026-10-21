import "server-only"

import { createHmac } from "node:crypto"

export function accountingSecret(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.AI_ACCOUNTING_SECRET?.trim() ?? ""
  if (value.length < 32 || value.length > 200) return null
  return value
}

export function accountingProof(
  secret: string,
  parts: Array<string | number | null | undefined>,
): string {
  const canonical = parts.map((part) => (part == null ? "" : String(part))).join("\n")
  return createHmac("sha256", secret).update(canonical).digest("hex")
}
