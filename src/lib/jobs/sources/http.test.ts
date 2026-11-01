import { describe, expect, it } from "vitest"

import { fetchApprovedJson } from "@/lib/jobs/sources/http"
import { MAX_SOURCE_BYTES } from "@/lib/jobs/urls"

const URL_OK = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true"

/** A JSON body of roughly `bytes` bytes, streamed in 64 KB pieces, that counts how much was pulled. */
function streamed(bytes: number) {
  const encoder = new TextEncoder()
  const piece = 64 * 1024
  const filler = Math.max(0, bytes - 20)
  let sent = 0
  let pulled = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === 0) {
        controller.enqueue(encoder.encode('{"jobs":[],"pad":"'))
        sent = 1
        return
      }
      if (pulled >= filler) {
        controller.enqueue(encoder.encode('"}'))
        controller.close()
        return
      }
      const size = Math.min(piece, filler - pulled)
      pulled += size
      controller.enqueue(encoder.encode("x".repeat(size)))
    },
  })
  return { body, pulled: () => pulled }
}

function fetchWith(body: BodyInit, headers: Record<string, string> = {}): typeof fetch {
  return (async () => new Response(body, { status: 200, headers })) as typeof fetch
}

describe("provider response size cap", () => {
  it("is 10 MB", () => {
    expect(MAX_SOURCE_BYTES).toBe(10_000_000)
  })

  it("accepts a body between 1 MB and 10 MB", async () => {
    const source = streamed(2_100_000)
    const parsed = (await fetchApprovedJson(URL_OK, { fetchImpl: fetchWith(source.body) })) as { pad: string }
    expect(parsed.pad.length).toBeGreaterThan(2_000_000)
  })

  it("rejects an advertised Content-Length over the cap before reading", async () => {
    const source = streamed(1_000)
    await expect(
      fetchApprovedJson(URL_OK, { fetchImpl: fetchWith(source.body, { "content-length": String(MAX_SOURCE_BYTES + 1) }) }),
    ).rejects.toThrow("oversized")
    expect(source.pulled()).toBe(0)
  })

  it("stops reading a streamed body with no Content-Length once it passes the cap", async () => {
    const source = streamed(MAX_SOURCE_BYTES * 3)
    await expect(fetchApprovedJson(URL_OK, { fetchImpl: fetchWith(source.body) })).rejects.toThrow("oversized")
    expect(source.pulled()).toBeLessThan(MAX_SOURCE_BYTES + 512 * 1024)
  })

  it("counts bytes, not characters", async () => {
    const multibyte = "é".repeat(Math.ceil(MAX_SOURCE_BYTES / 2) + 10)
    await expect(fetchApprovedJson(URL_OK, { fetchImpl: fetchWith(`{"pad":"${multibyte}"}`) })).rejects.toThrow("oversized")
  })
})
