import { createHash } from "node:crypto"

import { textTokens } from "@/lib/jobs/text"

export const JOB_PROVIDERS = ["greenhouse", "lever", "ashby"] as const
export type JobProvider = (typeof JOB_PROVIDERS)[number]

export const MENTIONED_SKILLS = [
  "airflow",
  "angular",
  "aws",
  "azure",
  "bigquery",
  "dbt",
  "django",
  "docker",
  "fastapi",
  "gcp",
  "golang",
  "graphql",
  "java",
  "javascript",
  "kafka",
  "kotlin",
  "kubernetes",
  "llm",
  "mysql",
  "node",
  "pandas",
  "php",
  "postgres",
  "postgresql",
  "python",
  "pytorch",
  "rails",
  "react",
  "redis",
  "ruby",
  "rust",
  "scala",
  "snowflake",
  "spark",
  "spring",
  "sql",
  "tensorflow",
  "terraform",
  "typescript",
  "vue",
] as const

const SKILL_SET = new Set<string>(MENTIONED_SKILLS)

const COUNTRY_ALIASES: Array<[string, string]> = [
  ["united states", "US"],
  ["united kingdom", "GB"],
  ["united states of america", "US"],
  ["canada", "CA"],
  ["usa", "US"],
  ["u.s.a.", "US"],
  ["u.s.", "US"],
  ["uk", "GB"],
  ["us", "US"],
  ["mexico", "MX"],
  ["germany", "DE"],
  ["france", "FR"],
  ["ireland", "IE"],
  ["netherlands", "NL"],
  ["australia", "AU"],
  ["india", "IN"],
  ["brazil", "BR"],
  ["singapore", "SG"],
]

export type NormalizedJob = {
  sourceJobId: string
  employerName: string | null
  employerDomain: string
  title: string
  locationText: string | null
  countryCode: string | null
  region: string | null
  workArrangement: "remote" | "hybrid" | "onsite" | "unknown"
  employmentType: "full_time" | "part_time" | "contract" | "internship" | "unknown"
  seniority: "intern" | "junior" | "mid" | "senior" | "staff" | "principal" | "manager" | "unknown"
  compensationMin: number | null
  compensationMax: number | null
  currency: string | null
  salaryPeriod: "hour" | "day" | "week" | "month" | "year" | "unknown"
  postedAt: string | null
  listingUrl: string
  applicationUrl: string | null
  applicationMethod: "external" | "easy_apply" | "ats" | "email" | "unknown"
  requisitionId: string | null
  descriptionText: string | null
  skills: string[]
  titleTokens: string[]
  skillTokens: string[]
  contentHash: string
  listingStatus: "active" | "unverified"
  provenance: Record<string, string | number | boolean | null>
}

export type RejectedJob = { sourceJobId: string | null; reason: string }

export function explicitCountry(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (/^[a-z]{2}$/.test(normalized)) {
    const iso = normalized.toUpperCase()
    if (iso === "US" || iso === "CA" || iso === "GB" || iso === "MX" || iso === "DE" || iso === "FR") return iso
  }
  const padded = ` ${normalized.replace(/[.,]/g, " ")} `
  const aliases = [...COUNTRY_ALIASES].sort((a, b) => b[0].length - a[0].length)
  for (const [name, code] of aliases) {
    if (padded.includes(` ${name} `)) return code
  }
  return null
}

export function seniorityFromTitle(title: string): NormalizedJob["seniority"] {
  const tokens = new Set(textTokens(title))
  const hits = [
    tokens.has("intern") || tokens.has("internship") ? "intern" : null,
    tokens.has("junior") ? "junior" : null,
    tokens.has("mid") ? "mid" : null,
    tokens.has("senior") ? "senior" : null,
    tokens.has("staff") ? "staff" : null,
    tokens.has("principal") ? "principal" : null,
    tokens.has("manager") ? "manager" : null,
  ].filter((value): value is NormalizedJob["seniority"] => value != null)
  if (hits.length !== 1) return "unknown"
  return hits[0] ?? "unknown"
}

export function mentionedSkills(text: string): string[] {
  return textTokens(text).filter((token) => SKILL_SET.has(token))
}

export function contentHash(parts: Array<string | null>): string {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "").join("\n"))
    .digest("hex")
}

export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null
    return parsed.toString()
  } catch {
    return null
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

export function salaryPeriod(value: string | null): NormalizedJob["salaryPeriod"] {
  if (!value) return "unknown"
  const token = value.trim().toLowerCase()
  if (["year", "yearly", "annual", "per-year-salary", "1 year"].includes(token)) return "year"
  if (["hour", "hourly", "per-hour-wage"].includes(token)) return "hour"
  if (["month", "monthly", "per-month-salary"].includes(token)) return "month"
  if (["week", "weekly", "per-week-salary"].includes(token)) return "week"
  if (["day", "daily", "per-day-wage"].includes(token)) return "day"
  return "unknown"
}

export function employmentType(value: string | null): NormalizedJob["employmentType"] {
  if (!value) return "unknown"
  const token = value.toLowerCase().replace(/[\s_-]+/g, "")
  if (["fulltime", "full"].includes(token)) return "full_time"
  if (["parttime", "part"].includes(token)) return "part_time"
  if (["contract", "contractor"].includes(token)) return "contract"
  if (["intern", "internship"].includes(token)) return "internship"
  return "unknown"
}

export function workArrangement(value: string | null, remoteFlag: boolean | null): NormalizedJob["workArrangement"] {
  if (!value) {
    if (remoteFlag === true) return "remote"
    return "unknown"
  }
  const token = value.toLowerCase().replace(/[\s_-]+/g, "")
  if (token === "remote") return "remote"
  if (token === "hybrid") return "hybrid"
  if (token === "onsite") return "onsite"
  if (remoteFlag === true) return "remote"
  return "unknown"
}

export function finishJob(
  input: Omit<NormalizedJob, "skills" | "titleTokens" | "skillTokens" | "contentHash" | "descriptionText"> & {
    descriptionText: string | null
    provider: string
  },
): NormalizedJob {
  const { provider, descriptionText, ...rest } = input
  const skills = mentionedSkills(`${rest.title}\n${descriptionText ?? ""}`)
  const titleTokens = textTokens(rest.title).slice(0, 40)
  const skillTokens = textTokens(skills.join(" ")).slice(0, 40)
  return {
    ...rest,
    descriptionText,
    skills: skills.slice(0, 40),
    titleTokens,
    skillTokens,
    contentHash: contentHash([
      provider,
      rest.sourceJobId,
      rest.title,
      rest.locationText,
      rest.listingUrl,
      descriptionText,
    ]),
  }
}
