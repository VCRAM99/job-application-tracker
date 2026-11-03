import "server-only"

import { getCurrentUser } from "@/lib/auth/session"
import { jobsAllowedFor } from "@/lib/beta"
import { recommendedJobsAllowlist, recommendedJobsEnabled } from "@/lib/jobs/flags"

/**
 * The flag and the signed-in user's place on BETA_USER_IDS or the older
 * JOB_RECOMMENDATIONS_ALLOWED_USER_IDS (see src/lib/beta.ts). Use this in place of
 * recommendedJobsEnabled for pages, actions, loaders, and the Add-to-Tracker prefill.
 */
export async function recommendedJobsAllowed(): Promise<boolean> {
  if (!recommendedJobsEnabled()) return false
  if (!process.env.BETA_USER_IDS?.trim() && recommendedJobsAllowlist().mode === "everyone") return true
  const user = await getCurrentUser()
  return jobsAllowedFor(user?.id ?? null)
}
