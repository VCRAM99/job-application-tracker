/**
 * LOCAL ONLY. Environment for the e2e server and seed.
 *
 * `next build` and `next start` run in production mode and read `.env.local`
 * (production values). Next never overrides a variable that is already set,
 * so the child process gets every key named in `.env.local`, `.env`, and the
 * `.env.production*` files preset to an empty value, then the local values
 * from `.env.development.local` and the e2e overrides. Only key names are read
 * from those files; their values are never read or printed.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321"
export const APP_PORT = 3100
export const FLAGS_OFF_PORT = 3101
export const FAKE_OPENAI_PORT = 3199
export const ROOT = path.resolve(__dirname, "../..")
export const STATE_DIR = path.join(ROOT, "e2e/.state")

export function readEnvFile(file: string): Record<string, string> {
  const full = path.join(ROOT, file)
  if (!existsSync(full)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (match) out[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, "")
  }
  return out
}

/** Local values only. Refuses anything that is not the local Supabase stack. */
export function localDevEnv(): Record<string, string> {
  const dev = readEnvFile(".env.development.local")
  if (dev.NEXT_PUBLIC_SUPABASE_URL !== LOCAL_SUPABASE_URL) {
    throw new Error(`Refusing: .env.development.local must point NEXT_PUBLIC_SUPABASE_URL at ${LOCAL_SUPABASE_URL}.`)
  }
  for (const key of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "AI_CREDENTIALS_KEY", "AI_ACCOUNTING_SECRET"]) {
    if (!dev[key]) throw new Error(`Missing ${key} in .env.development.local.`)
  }
  return dev
}

/** Key names only. Values in these files are never read. */
function keyNames(file: string): string[] {
  const full = path.join(ROOT, file)
  if (!existsSync(full)) return []
  return readFileSync(full, "utf8")
    .split(/\r?\n/)
    .map((line) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name))
}

const SHADOWED_FILES = [".env", ".env.local", ".env.production", ".env.production.local"]

/** Flag sets for the two e2e servers. */
export function serverEnv(variant: "on" | "off"): Record<string, string> {
  const dev = localDevEnv()
  const shadow: Record<string, string> = {}
  for (const file of SHADOWED_FILES) for (const key of keyNames(file)) shadow[key] = ""
  const flags =
    variant === "on"
      ? {
          AI_FEATURES_ENABLED: "true",
          JOB_ANALYSIS_ENABLED: "true",
          RESUME_STUDIO_ENABLED: "true",
          CAREER_COACH_ENABLED: "true",
          JOB_RECOMMENDATIONS_ENABLED: "true",
        }
      : {
          AI_FEATURES_ENABLED: "false",
          JOB_ANALYSIS_ENABLED: "false",
          RESUME_STUDIO_ENABLED: "false",
          CAREER_COACH_ENABLED: "false",
          JOB_RECOMMENDATIONS_ENABLED: "false",
        }
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    ...shadow,
    ...dev,
    ...flags,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${variant === "on" ? APP_PORT : FLAGS_OFF_PORT}`,
    // Every user the flag allows: the e2e user's id changes after a reset.
    JOB_RECOMMENDATIONS_ALLOWED_USER_IDS: "",
    JOB_INGESTION_ENABLED: "false",
    JOB_EMAIL_DELIVERY_ENABLED: "false",
    AI_MANAGED_ENABLED: "false",
    // The OpenAI SDK reads this: every model call goes to the local fake.
    OPENAI_BASE_URL: `http://127.0.0.1:${FAKE_OPENAI_PORT}/v1`,
    GEMINI_API_KEY: "",
    AI_PLATFORM_OPENAI_API_KEY: "",
    AI_PLATFORM_ANTHROPIC_API_KEY: "",
    AI_PLATFORM_GOOGLE_API_KEY: "",
  }
}
