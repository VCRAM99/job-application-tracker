import type { Instrumentation } from "next"

/**
 * Sentry for the Node.js and edge runtimes, only when SENTRY_DSN is set. Without it nothing is
 * imported. Events are scrubbed (src/lib/monitoring/scrub.ts) before they leave the server.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return
  const Sentry = await import("@sentry/nextjs")
  const { sentryBaseOptions } = await import("@/lib/monitoring/scrub")
  Sentry.init({ ...sentryBaseOptions(dsn), environment: process.env.VERCEL_ENV ?? "development" })
}

/** Errors thrown while rendering or in route handlers and server actions. Paths only, no request data. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!process.env.SENTRY_DSN?.trim()) return
  const Sentry = await import("@sentry/nextjs")
  Sentry.captureRequestError(error, { ...request, headers: {}, path: request.path.split("?")[0] ?? "" }, context)
}
