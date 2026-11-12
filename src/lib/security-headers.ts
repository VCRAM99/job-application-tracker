// Relative: next.config.ts loads this file, where the @/ alias does not resolve.
import { TURNSTILE_ORIGIN, turnstileSiteKey } from "./auth/captcha"

type Env = Record<string, string | undefined>

/**
 * The Supabase origin the browser may call: the configured project only (no *.supabase.co
 * wildcard), plus its websocket origin. Browser calls are Storage uploads for resumes and the
 * auth client.
 */
export function supabaseConnectSources(env: Env = process.env): string[] {
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    if (url.protocol !== "https:" && url.protocol !== "http:") return []
    const ws = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`
    return [url.origin, ws]
  } catch {
    return []
  }
}

/**
 * Production CSP. Next.js App Router inlines its bootstrap scripts, so script-src keeps
 * 'unsafe-inline' (a nonce would make every page dynamic); everything else is same-origin.
 * Sentry reports through the same-origin /monitoring tunnel, so it needs no extra source.
 * Turnstile's origin is added to script-src and frame-src only when its site key is set.
 */
export function contentSecurityPolicy(env: Env = process.env): string {
  const supabase = supabaseConnectSources(env)
  const https = supabase[0]?.startsWith("https:") ?? false
  // Cloudflare Turnstile (auth forms) loads a script and renders an iframe from its own origin,
  // allowed only when a valid site key turns the widget on.
  const turnstile = turnstileSiteKey(env) ? [TURNSTILE_ORIGIN] : []
  return [
    "default-src 'self'",
    `script-src ${["'self'", "'unsafe-inline'", ...turnstile].join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${["'self'", ...supabase].join(" ")}`,
    "worker-src 'self' blob:",
    `frame-src ${turnstile.length ? turnstile.join(" ") : "'none'"}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ")
}

export function securityHeaders(nodeEnv = process.env.NODE_ENV, env: Env = process.env): Array<{ key: string; value: string }> {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  ]
  if (nodeEnv === "production") {
    headers.push({ key: "Content-Security-Policy", value: contentSecurityPolicy(env) })
    // Browsers ignore HSTS on plain-http responses, so a local `next start` is unaffected.
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" })
  }
  return headers
}
