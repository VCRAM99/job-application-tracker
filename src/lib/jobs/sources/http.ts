import { MAX_SOURCE_BYTES, SourceRequestError, assertApprovedSourceUrl } from "@/lib/jobs/urls"

export type SourceLoader = (url: string) => Promise<unknown>

export async function fetchApprovedJson(
  url: string,
  input: { signal?: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<unknown> {
  const target = assertApprovedSourceUrl(url)
  const fetchImpl = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000)
  const onAbort = () => controller.abort()
  input.signal?.addEventListener("abort", onAbort)
  try {
    const response = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
    if (response.status >= 300 && response.status < 400) {
      throw new SourceRequestError("redirect_blocked")
    }
    if (!response.ok) throw new SourceRequestError("http_status")
    const advertised = Number(response.headers.get("content-length") ?? "0")
    if (Number.isFinite(advertised) && advertised > MAX_SOURCE_BYTES) {
      controller.abort()
      throw new SourceRequestError("oversized")
    }
    const text = await readCapped(response, controller)
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new SourceRequestError("malformed_json")
    }
  } finally {
    clearTimeout(timeout)
    input.signal?.removeEventListener("abort", onAbort)
  }
}

/** Reads the body in chunks and aborts the request as soon as it passes MAX_SOURCE_BYTES. */
async function readCapped(response: Response, controller: AbortController): Promise<string> {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_SOURCE_BYTES) {
      await reader.cancel().catch(() => undefined)
      controller.abort()
      throw new SourceRequestError("oversized")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
