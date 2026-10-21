import { AiRequestError, type ProviderId, type StoredExecutionMode } from "@/lib/ai/types"

/**
 * Cloud execution is the only target implemented in M1.
 * A future Windows/macOS companion can add a desktop target that performs the
 * same structured task and writes the same suggestion rows. This module does
 * not pair devices, call Ollama, or accept remote commands.
 */
export type CloudExecution = {
  kind: "cloud"
  mode: StoredExecutionMode
  provider: ProviderId
  model: string
}

export type DesktopExecution = {
  kind: "desktop"
}

export type ExecutionTarget = CloudExecution | DesktopExecution

export const DESKTOP_EXECUTION_AVAILABLE = false

export function assertCloudExecution(target: ExecutionTarget): CloudExecution {
  if (target.kind !== "cloud") {
    throw new AiRequestError("mode_unavailable")
  }
  return target
}
