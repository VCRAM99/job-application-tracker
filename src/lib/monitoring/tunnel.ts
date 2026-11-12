/**
 * Same-origin Sentry tunnel (`POST /monitoring`). The browser SDK sends its envelopes here so the
 * CSP needs no Sentry host and ad blockers do not drop error reports. Unlike the SDK's rewrite
 * tunnel, which relays to any `?o=&p=` pair, this forwards only envelopes whose DSN names the
 * configured project: same host, same project id, same public key. Anything else is refused, so
 * the domain cannot be used to relay events to other Sentry projects.
 *
 * Bodies are never logged. The response carries only Sentry's status code.
 */

/** Envelopes from the browser SDK are small (errors only, no replays or attachments). */
export const MAX_ENVELOPE_BYTES = 256 * 1024

export type SentryTarget = { host: string; projectId: string; publicKey: string }

/** Parses `https://<key>@<host>/<projectId>`; null when unset or malformed. */
export function parseDsn(dsn: string | undefined | null): SentryTarget | null {
  if (!dsn?.trim()) return null
  try {
    const url = new URL(dsn.trim())
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "")
    if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(projectId)) return null
    return { host: url.host, projectId, publicKey: url.username }
  } catch {
    return null
  }
}

export type TunnelDecision =
  | { ok: true; url: string }
  | { ok: false; status: 400 | 403 | 404 | 413 }

/** Decides whether an envelope may be forwarded, and where. */
export function tunnelDecision(envelope: string, configuredDsn: string | undefined): TunnelDecision {
  const target = parseDsn(configuredDsn)
  if (!target) return { ok: false, status: 404 }
  if (new TextEncoder().encode(envelope).byteLength > MAX_ENVELOPE_BYTES) return { ok: false, status: 413 }
  const newline = envelope.indexOf("\n")
  let header: unknown
  try {
    header = JSON.parse(newline === -1 ? envelope : envelope.slice(0, newline))
  } catch {
    return { ok: false, status: 400 }
  }
  const sent = parseDsn(typeof header === "object" && header && "dsn" in header && typeof header.dsn === "string" ? header.dsn : null)
  if (!sent) return { ok: false, status: 400 }
  if (sent.host !== target.host || sent.projectId !== target.projectId || sent.publicKey !== target.publicKey) {
    return { ok: false, status: 403 }
  }
  return { ok: true, url: `https://${target.host}/api/${target.projectId}/envelope/` }
}

/**
 * Reads at most `limit + 1` bytes, so an oversized or endless body is cut off early instead of
 * being buffered. Returns null when the body is larger than `limit`.
 */
export async function readCapped(body: ReadableStream<Uint8Array> | null, limit = MAX_ENVELOPE_BYTES): Promise<string | null> {
  if (!body) return ""
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}
