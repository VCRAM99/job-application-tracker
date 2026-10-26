import type { AiErrorCode } from "@/lib/ai/types"

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * An identical request is already running under the same idempotency key, so
 * its reservation was reused and no second charge was made. Wait for that run's
 * complete analysis instead of showing an error. Returns null when the failure
 * is anything else or the other run has not finished in time.
 */
export async function settleDuplicateRun(
  failure: { code: AiErrorCode; usageEventId?: string },
  findComplete: () => Promise<string | null>,
  options: { attempts?: number; delayMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<string | null> {
  if (failure.code !== "in_progress" || !failure.usageEventId) return null
  const attempts = options.attempts ?? 25
  const wait = options.wait ?? sleep
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const id = await findComplete()
    if (id) return id
    await wait(options.delayMs ?? 1000)
  }
  return null
}
