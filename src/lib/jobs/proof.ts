import "server-only"

import { createHmac } from "node:crypto"

export const JOB_OPERATIONS = [
  "apply-catalog",
  "register-source",
  "approve-source",
  "record-source-failure",
  "record-alerts",
  "collect-alerts",
] as const

export type JobOperation = (typeof JOB_OPERATIONS)[number]

export function jobCatalogSecret(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.JOB_CATALOG_WRITE_SECRET?.trim() ?? ""
  if (value.length < 32 || value.length > 200) return null
  return value
}

export function jobOperationProof(secret: string, operation: JobOperation, payload: string): string {
  return createHmac("sha256", secret).update(`${operation}\n${payload}`).digest("hex")
}
