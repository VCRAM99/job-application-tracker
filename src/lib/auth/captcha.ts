/**
 * Cloudflare Turnstile for sign-up, sign-in, and the password-reset request.
 *
 * The widget is on only when NEXT_PUBLIC_TURNSTILE_SITE_KEY holds a well-formed site key. The
 * app never decides whether a token is required: it passes any token it receives to Supabase
 * Auth, and Supabase enforces CAPTCHA only after it is turned on in Attack Protection. So with no
 * key, a malformed key, or a widget that fails to load, the forms work exactly as before until
 * Supabase CAPTCHA is enabled (see docs/launch.md for the order).
 */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com"
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`
/** The hidden field the widget writes its token into, inside the form. */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response"

const SITE_KEY = /^[0-9A-Za-z_-]{16,64}$/

/** A usable site key, or null when unset or malformed (the widget then stays off). */
export function validTurnstileSiteKey(value: string | undefined | null): string | null {
  const key = value?.trim() ?? ""
  return SITE_KEY.test(key) ? key : null
}

/** Server side: the site key from the environment, or null. */
export function turnstileSiteKey(env: Record<string, string | undefined> = process.env): string | null {
  return validTurnstileSiteKey(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
}

/** The token a submitted form carries, if any. Tokens are opaque; overlong values are ignored. */
export function captchaTokenFrom(formData: FormData): string | undefined {
  const value = formData.get(TURNSTILE_RESPONSE_FIELD)
  if (typeof value !== "string") return undefined
  const token = value.trim()
  return token && token.length <= 4096 ? token : undefined
}
