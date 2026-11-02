/**
 * Development safety guard. `next dev` must talk to the local Supabase stack
 * so a dev session can never write to the hosted project by accident. It runs
 * only in the development-server phase (see next.config.ts); builds and
 * production servers never call it.
 */
type Env = Record<string, string | undefined>

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"])

export function isLocalSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) && url.pathname.replace(/\/$/, "") === ""
  } catch {
    return false
  }
}

/** The error to stop `next dev` with, or null when it may start. Never includes the URL itself. */
export function devSupabaseGuardError(env: Env = process.env): string | null {
  if (isLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL)) return null
  if (env.ALLOW_REMOTE_SUPABASE_IN_DEV === "true") return null
  return [
    "Refusing to start next dev: NEXT_PUBLIC_SUPABASE_URL is not the local Supabase stack.",
    "Use http://127.0.0.1:54321 (npx supabase start) in .env.development.local,",
    "or set ALLOW_REMOTE_SUPABASE_IN_DEV=true to point a dev server at a hosted project on purpose.",
  ].join(" ")
}
