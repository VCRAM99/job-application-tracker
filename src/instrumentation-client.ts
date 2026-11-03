/**
 * Browser Sentry, only when a DSN was set at build time (next.config.ts copies SENTRY_DSN to
 * NEXT_PUBLIC_SENTRY_DSN). Without it the SDK chunk is never loaded. Reports go through the
 * same-origin /monitoring tunnel, and every event is scrubbed before sending.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  void Promise.all([import("@sentry/nextjs"), import("@/lib/monitoring/scrub")]).then(([Sentry, { sentryBaseOptions }]) => {
    Sentry.init({ ...sentryBaseOptions(dsn), tunnel: "/monitoring", tracesSampleRate: 0 })
  })
}
