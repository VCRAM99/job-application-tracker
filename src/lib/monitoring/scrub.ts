/**
 * Sentry event scrubbing, shared by the server, edge, and browser SDKs. Nothing a user typed or
 * uploaded may leave the app: no request bodies, cookies, headers, or query strings; no user
 * fields; no breadcrumbs; and messages are cut short with emails, keys, and tokens redacted.
 * Only the error type, a short message, the stack, and the tags we set (codes) remain.
 */
type Frame = Record<string, unknown>
type SentryLikeEvent = {
  message?: string
  request?: { url?: string; method?: string; data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown; env?: unknown }
  user?: unknown
  breadcrumbs?: unknown
  extra?: unknown
  contexts?: Record<string, unknown>
  exception?: { values?: Array<{ type?: string; value?: string; stacktrace?: { frames?: Frame[] } }> }
  tags?: Record<string, unknown>
  [key: string]: unknown
}

const MAX_MESSAGE = 200
const DROPPED_FRAME_KEYS = new Set(["vars", "pre_context", "post_context", "context_line"])
const PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]"],
  [/\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, "[key]"],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, "[key]"],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "[key]"],
  [/\bsb_(publishable|secret)_[A-Za-z0-9_-]+/g, "[key]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]"],
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]"],
]

/** Redacts emails, keys, tokens, and ids, then cuts to a short length. */
export function scrubText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  let out = value
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement)
  return out.length > MAX_MESSAGE ? `${out.slice(0, MAX_MESSAGE)}…` : out
}

function pathOnly(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return scrubText(new URL(url, "http://local").pathname)
  } catch {
    return undefined
  }
}

export function scrubEvent<T>(input: T): T {
  const event = input as SentryLikeEvent
  const next: SentryLikeEvent = { ...event }
  next.message = scrubText(event.message)
  next.request = event.request ? { method: event.request.method, url: pathOnly(event.request.url) } : undefined
  delete next.user
  delete next.breadcrumbs
  delete next.extra
  if (event.contexts) {
    // Runtime and OS facts only; drop anything that could carry state or input.
    const { runtime, os, browser, device } = event.contexts as Record<string, unknown>
    next.contexts = Object.fromEntries(Object.entries({ runtime, os, browser, device }).filter(([, value]) => value !== undefined))
  }
  if (event.exception?.values) {
    next.exception = {
      values: event.exception.values.map((value) => ({
        ...value,
        value: scrubText(value.value),
        stacktrace: value.stacktrace
          ? {
              frames: value.stacktrace.frames?.map((frame) => {
                // Keep where the error happened, never the source lines or local variables around it.
                return Object.fromEntries(Object.entries(frame).filter(([key]) => !DROPPED_FRAME_KEYS.has(key)))
              }),
            }
          : undefined,
      })),
    }
  }
  return next as T
}

/** Sentry options shared by every runtime: conservative sampling and no PII. */
export function sentryBaseOptions(dsn: string) {
  return {
    dsn,
    sendDefaultPii: false,
    sampleRate: 1,
    tracesSampleRate: 0.02,
    maxBreadcrumbs: 0,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: () => null,
  }
}
