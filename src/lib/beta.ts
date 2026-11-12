import "server-only"

import { cache } from "react"

import { aiFeaturesEnabled, jobAnalysisEnabled } from "@/lib/ai/flags"
import { getCurrentUser } from "@/lib/auth/session"
import { careerCoachEnabled } from "@/lib/coach/flags"
import { recommendedJobsAllowlist, recommendedJobsEnabled } from "@/lib/jobs/flags"
import { resumeStudioEnabled } from "@/lib/resume/flags"

type Env = Record<string, string | undefined>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type BetaAllowlist =
  | { mode: "everyone" }
  | { mode: "all-signed-in" }
  | { mode: "listed"; ids: ReadonlySet<string> }
  | { mode: "nobody" }

/**
 * BETA_USER_IDS: comma-separated user ids allowed to use every V2 feature (jobs, fit analysis,
 * career AI, Resume Studio, the coach). The feature flags still have to be on as well.
 * - "*" alone: every signed-in user (the public launch). "*" mixed with ids is malformed.
 * - A malformed entry closes V2 to everyone rather than guessing which ids were meant.
 * - Unset or blank on any Vercel deployment: nobody (a forgotten list never opens V2 in production).
 * - Unset or blank locally (no VERCEL_ENV): everyone, so development and e2e work without a list.
 */
export function betaAllowlist(env: Env = process.env): BetaAllowlist {
  const raw = env.BETA_USER_IDS?.trim() ?? ""
  if (!raw) return env.VERCEL_ENV?.trim() ? { mode: "nobody" } : { mode: "everyone" }
  if (raw === "*") return { mode: "all-signed-in" }
  const ids = raw.split(",").map((item) => item.trim()).filter(Boolean)
  if (ids.length === 0 || ids.some((id) => !UUID.test(id))) return { mode: "nobody" }
  return { mode: "listed", ids: new Set(ids.map((id) => id.toLowerCase())) }
}

export function betaAllowedFor(userId: string | null, env: Env = process.env): boolean {
  const list = betaAllowlist(env)
  if (list.mode === "everyone") return true
  if (list.mode === "nobody" || !userId) return false
  if (list.mode === "all-signed-in") return true
  return list.ids.has(userId.toLowerCase())
}

/**
 * Recommended Jobs: the jobs flag, and either BETA_USER_IDS or the older
 * JOB_RECOMMENDATIONS_ALLOWED_USER_IDS (kept as an alias). With BETA_USER_IDS unset the alias
 * keeps its own rules (unset alias: everyone the flag allows). With BETA_USER_IDS="*" every
 * signed-in user gets jobs, and the alias, when set, only narrows that to its listed users.
 * A malformed list closes jobs.
 */
export function jobsAllowedFor(userId: string | null, env: Env = process.env): boolean {
  if (!recommendedJobsEnabled(env)) return false
  const alias = recommendedJobsAllowlist(env)
  const aliasAllows = alias.mode === "everyone" || (alias.mode === "listed" && Boolean(userId) && alias.ids.has(userId!.toLowerCase()))
  if (!env.BETA_USER_IDS?.trim()) return aliasAllows
  const beta = betaAllowlist(env)
  if (beta.mode === "nobody") return false
  if (alias.mode === "nobody") return false
  if (beta.mode === "all-signed-in") return Boolean(userId) && aliasAllows
  const aliasListed = alias.mode === "listed" && Boolean(userId) && alias.ids.has(userId!.toLowerCase())
  return betaAllowedFor(userId, env) || aliasListed
}

export type V2Feature = "jobs" | "career" | "analyze" | "resumes" | "coach"

/** One feature for one user: its flag (from the environment) and the beta list. */
export function v2AllowedFor(feature: V2Feature, userId: string | null, env: Env = process.env): boolean {
  if (feature === "jobs") return jobsAllowedFor(userId, env)
  const flag =
    feature === "career"
      ? aiFeaturesEnabled(env)
      : feature === "analyze"
        ? jobAnalysisEnabled(env)
        : feature === "resumes"
          ? resumeStudioEnabled(env)
          : careerCoachEnabled(env)
  return flag && betaAllowedFor(userId, env)
}

/** The signed-in user's id for this request (React cache), or null. */
const currentUserId = cache(async () => (await getCurrentUser())?.id ?? null)

/**
 * Per-request checks for pages, server actions, loaders, and route handlers. Every V2 entry
 * point awaits one of these, so a user who is not on the beta list gets V1 only, even through
 * a direct URL or a server action call.
 */
export async function v2Allowed(feature: V2Feature): Promise<boolean> {
  return v2AllowedFor(feature, await currentUserId())
}

export const careerAllowed = () => v2Allowed("career")
export const analyzeAllowed = () => v2Allowed("analyze")
export const resumesAllowed = () => v2Allowed("resumes")
export const coachAllowed = () => v2Allowed("coach")
export const jobsAllowed = () => v2Allowed("jobs")
