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
      throw new SourceRequestError("oversized")
    }
    const text = await response.text()
    if (text.length > MAX_SOURCE_BYTES) throw new SourceRequestError("oversized")
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
