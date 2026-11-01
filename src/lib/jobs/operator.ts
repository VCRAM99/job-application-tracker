import "server-only"

import { JOB_PROVIDERS } from "@/lib/jobs/normalize"

type Env = Record<string, string | undefined>

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321"
export const TARGET_FILES = { local: ".env.development.local", production: ".env.local" } as const

/** Read only from the target file. An exported copy in the shell could point a local command at production. */
const FILE_ONLY_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "JOB_CATALOG_WRITE_SECRET"]

export type ParsedArgs = { command: string; positional: string[]; flags: Record<string, string | true> }

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index] ?? ""
    if (!item.startsWith("--")) {
      positional.push(item)
      continue
    }
    const body = item.slice(2)
    const equals = body.indexOf("=")
    const name = equals === -1 ? body : body.slice(0, equals)
    const inline = equals === -1 ? undefined : body.slice(equals + 1)
    if (!name) continue
    const next = rest[index + 1]
    if (inline !== undefined) flags[name] = inline
    else if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next
      index += 1
    } else flags[name] = true
  }
  return { command, positional, flags }
}

/** KEY=VALUE lines. Comments, blank lines, and an optional `export ` prefix are allowed. */
export function parseEnvFile(text: string): Env {
  const env: Env = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue
    let value = match[2] ?? ""
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1)
    env[match[1] as string] = value
  }
  return env
}

export type TargetResult =
  | { ok: true; target: "local" | "production"; env: Env; host: string }
  | { ok: false; message: string }

/**
 * Local is the default and is refused unless the file points at the local
 * Supabase stack. Production loads .env.local only with --target production,
 * names the host and the action, and needs the project ref typed back.
 */
export async function resolveTarget(input: {
  flag: string | true | undefined
  action: string
  readFile: (name: string) => string | null
  shellEnv: Env
  ask: (question: string) => Promise<string>
  print: (line: string) => void
}): Promise<TargetResult> {
  const target = input.flag === undefined ? "local" : input.flag
  if (target !== "local" && target !== "production") {
    return { ok: false, message: "--target must be local or production." }
  }
  const exported = FILE_ONLY_KEYS.filter((key) => input.shellEnv[key]?.trim())
  if (exported.length > 0) {
    return { ok: false, message: `Unset ${exported.join(", ")} in this shell. The target file is the only source for them.` }
  }
  const file = TARGET_FILES[target]
  const text = input.readFile(file)
  if (text == null) return { ok: false, message: `${file} was not found.` }
  const env = parseEnvFile(text)
  let url: URL
  try {
    url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "")
  } catch {
    return { ok: false, message: `${file} has no valid NEXT_PUBLIC_SUPABASE_URL.` }
  }
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    return { ok: false, message: `${file} has no NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.` }
  }

  if (target === "local") {
    if (url.origin !== LOCAL_SUPABASE_URL) {
      return {
        ok: false,
        message: `${file} points at ${url.host}, not ${new URL(LOCAL_SUPABASE_URL).host}. Use --target production for a hosted project.`,
      }
    }
    return { ok: true, target, env, host: url.host }
  }

  const ref = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.host)?.[1]
  if (url.protocol !== "https:" || !ref) {
    return { ok: false, message: `${file} does not point at a hosted Supabase project.` }
  }
  input.print(`Target: PRODUCTION ${url.host}`)
  input.print(`Action: ${input.action}`)
  const typed = (await input.ask(`Type the project ref (${ref.slice(0, 4)}…) to continue: `)).trim()
  if (typed !== ref) return { ok: false, message: "The project ref did not match. Nothing was changed." }
  return { ok: true, target, env, host: url.host }
}

function text(flags: ParsedArgs["flags"], name: string): string {
  const value = flags[name]
  return typeof value === "string" ? value.trim() : ""
}

export type PayloadResult = { ok: true; payload: Record<string, unknown> } | { ok: false; message: string }

const IDENTIFIER = /^[A-Za-z0-9_-]{1,80}$/

function activation(flags: ParsedArgs["flags"]): PayloadResult {
  const fields = text(flags, "fields")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const record = {
    accessMethod: text(flags, "access-method") || "documented_https_json",
    approvedUsage: text(flags, "usage"),
    attributionRequirements: text(flags, "attribution"),
    retentionRestrictions: text(flags, "retention"),
    allowedStorageFields: fields,
  }
  const missing = [
    ["--usage", record.approvedUsage],
    ["--attribution", record.attributionRequirements],
    ["--retention", record.retentionRestrictions],
    ["--fields", fields.join(",")],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)
  if (missing.length > 0) return { ok: false, message: `Missing ${missing.join(", ")}.` }
  return { ok: true, payload: record }
}

export function sourceSlug(provider: string, identifier: string): string {
  return `${provider}:${identifier}`.toLowerCase()
}

/** register_job_source always stores a draft with terms unclear, refresh limit 0, and live ingestion off. */
export function registerPayload(flags: ParsedArgs["flags"]): PayloadResult {
  const provider = text(flags, "provider")
  const identifier = text(flags, "identifier")
  const region = text(flags, "region") || "global"
  const employerName = text(flags, "employer-name")
  const employerDomain = text(flags, "employer-domain").toLowerCase()
  if (!(JOB_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, message: "--provider must be greenhouse, lever, or ashby." }
  }
  if (!IDENTIFIER.test(identifier)) return { ok: false, message: "--identifier must match [A-Za-z0-9_-]{1,80}." }
  if (region !== "global" && region !== "eu") return { ok: false, message: "--region must be global or eu." }
  if (!employerName) return { ok: false, message: "Missing --employer-name." }
  if (employerDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(employerDomain)) {
    return { ok: false, message: "--employer-domain must be a bare domain such as example.com." }
  }
  const record = activation(flags)
  if (!record.ok) return record
  return {
    ok: true,
    payload: {
      provider,
      slug: text(flags, "slug") || sourceSlug(provider, identifier),
      displayName: text(flags, "display-name") || employerName,
      sourceIdentifier: identifier,
      region,
      employerName,
      employerDomain,
      ...record.payload,
    },
  }
}

/** Defaults keep the source a draft with live ingestion off. Each change has to be named. */
export function approvePayload(flags: ParsedArgs["flags"]): PayloadResult {
  const slug = text(flags, "slug")
  const approvalStatus = text(flags, "status") || "draft"
  const termsStatus = text(flags, "terms") || "unclear"
  const limitText = text(flags, "refresh-limit") || "0"
  const refreshLimitPerDay = Number(limitText)
  const liveIngestionEnabled = flags.live === true || text(flags, "live") === "true"
  if (!/^[a-z0-9:_-]{3,80}$/.test(slug)) return { ok: false, message: "--slug must be the registered source slug." }
  if (!["draft", "approved", "revoked"].includes(approvalStatus)) {
    return { ok: false, message: "--status must be draft, approved, or revoked." }
  }
  if (!["unclear", "permitted", "restricted"].includes(termsStatus)) {
    return { ok: false, message: "--terms must be unclear, permitted, or restricted." }
  }
  if (!/^\d+$/.test(limitText) || refreshLimitPerDay > 24) {
    return { ok: false, message: "--refresh-limit must be a whole number from 0 to 24." }
  }
  if (liveIngestionEnabled && (approvalStatus !== "approved" || termsStatus !== "permitted" || refreshLimitPerDay < 1)) {
    return { ok: false, message: "--live needs --status approved, --terms permitted, and --refresh-limit 1 to 24." }
  }
  const record = activation(flags)
  if (!record.ok) return record
  return {
    ok: true,
    payload: { slug, approvalStatus, termsStatus, refreshLimitPerDay, liveIngestionEnabled, ...record.payload },
  }
}
