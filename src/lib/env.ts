import { z } from "zod"

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function assertPublishableKey(key: string): void {
  const normalized = key.toLowerCase()
  if (
    normalized.startsWith("sb_secret_") ||
    normalized.includes("service_role")
  ) {
    throw new Error(
      "Supabase secret keys must never be used in the application client. Use the publishable key.",
    )
  }
}

export function parsePublicEnv(
  input: Record<string, string | undefined>,
): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(input.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: emptyToUndefined(
      input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    NEXT_PUBLIC_SITE_URL: emptyToUndefined(input.NEXT_PUBLIC_SITE_URL),
  })

  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ")
    throw new Error(
      `Invalid Supabase environment (${fields}). Copy .env.example to .env.local and set the project URL and publishable key.`,
    )
  }

  assertPublishableKey(parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  return parsed.data
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  })
}

export function getSiteUrl(
  env: PublicEnv = getPublicEnv(),
  vercelUrl = process.env.VERCEL_URL,
): string {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
  }

  if (vercelUrl) {
    return `https://${vercelUrl}`
  }

  return "http://localhost:3000"
}
