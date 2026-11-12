import { MAX_ENVELOPE_BYTES, readCapped, tunnelDecision } from "@/lib/monitoring/tunnel"

/**
 * Sentry tunnel for the browser SDK. Forwards an envelope only when its DSN is the configured
 * SENTRY_DSN (src/lib/monitoring/tunnel.ts). Nothing about the request is logged.
 */
export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > MAX_ENVELOPE_BYTES) return new Response(null, { status: 413 })
  const envelope = await readCapped(request.body)
  if (envelope === null) return new Response(null, { status: 413 })

  const decision = tunnelDecision(envelope, process.env.SENTRY_DSN)
  if (!decision.ok) return new Response(null, { status: decision.status })

  try {
    const upstream = await fetch(decision.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      signal: AbortSignal.timeout(10_000),
    })
    return new Response(null, { status: upstream.status })
  } catch {
    return new Response(null, { status: 502 })
  }
}
