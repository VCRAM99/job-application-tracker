import {
  type AiErrorCode,
  type ExecutionMode,
  type StoredExecutionMode,
} from "@/lib/ai/types"

export function resolveExecutionMode(
  saved: StoredExecutionMode | null,
  requested: ExecutionMode,
): { ok: true; mode: StoredExecutionMode } | { ok: false; code: AiErrorCode } {
  if (requested === "local") return { ok: false, code: "mode_unavailable" }
  if (!saved) return { ok: false, code: "not_configured" }
  if (saved !== requested) return { ok: false, code: "mode_mismatch" }
  return { ok: true, mode: saved }
}
