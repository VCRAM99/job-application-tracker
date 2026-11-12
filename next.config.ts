import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { withSentryConfig } from "@sentry/nextjs/config";

import { devSupabaseGuardError } from "./src/lib/dev-guard";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
  // The browser SDK starts only when a DSN was present at build time.
  env: { NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN?.trim() ?? "" },
  // The resume PDF export reads its embedded Noto Sans files at runtime.
  outputFileTracingIncludes: { "/api/resumes/versions/[id]/export": ["./src/lib/resume/fonts/*"] },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

/**
 * `next dev` refuses to start unless it points at local Supabase (src/lib/dev-guard.ts).
 * Every other phase, including `next build` and `next start`, gets the config unchanged.
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    const error = devSupabaseGuardError(process.env);
    if (error) throw new Error(error);
  }
  if (!process.env.SENTRY_DSN?.trim()) return nextConfig;
  // Sentry's build step only with a DSN: source maps uploaded only when SENTRY_AUTH_TOKEN (plus
  // SENTRY_ORG and SENTRY_PROJECT) is present at build. The /monitoring tunnel is our own route
  // handler (src/app/monitoring/route.ts), which relays only to the configured DSN.
  const token = process.env.SENTRY_AUTH_TOKEN?.trim();
  return withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: token,
    silent: true,
    telemetry: false,
    sourcemaps: { disable: !token, deleteSourcemapsAfterUpload: true },
  }) as NextConfig;
}
