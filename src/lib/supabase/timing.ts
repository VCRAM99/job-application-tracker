/**
 * Opt-in request timing for performance work. Off unless PERF_TIMING is
 * exactly "1" outside any Vercel environment. Each Supabase request logs its
 * method, path, status, and duration. The query string, headers, and bodies
 * are never logged: they can hold ids, search text, or tokens.
 */
type Env = Record<string, string | undefined>

export function perfTimingEnabled(env: Env = process.env): boolean {
  return env.PERF_TIMING === "1" && !env.VERCEL_ENV && !env.VERCEL
}

/** `/rest/v1/applications?select=*&user_id=eq.…` → `/rest/v1/applications`. */
export function timingPath(input: string | URL | Request): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  try {
    return new URL(raw).pathname
  } catch {
    return "(unparsed)"
  }
}

export function timedFetch(base: typeof fetch = fetch, log: (line: string) => void = console.log): typeof fetch {
  return async (input, init) => {
    const started = performance.now()
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
    let status = "error"
    try {
      const response = await base(input, init)
      status = String(response.status)
      return response
    } finally {
      log(`[perf] supabase ${method} ${timingPath(input)} ${status} ${(performance.now() - started).toFixed(1)}ms`)
    }
  }
}

/** Supabase client options: a timed fetch when enabled, nothing otherwise. */
export function timingOptions(env: Env = process.env): { global?: { fetch: typeof fetch } } {
  return perfTimingEnabled(env) ? { global: { fetch: timedFetch() } } : {}
}
