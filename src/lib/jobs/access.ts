import "server-only"

import { getCurrentUser } from "@/lib/auth/session"
import { recommendedJobsAllowedFor, recommendedJobsAllowlist, recommendedJobsEnabled } from "@/lib/jobs/flags"

/**
 * The flag and, when JOB_RECOMMENDATIONS_ALLOWED_USER_IDS is set, the signed-in
 * user's id. Use this in place of recommendedJobsEnabled for pages, actions,
 * loaders, and the Add-to-Tracker prefill.
 */
export async function recommendedJobsAllowed(): Promise<boolean> {
  if (!recommendedJobsEnabled()) return false
  if (recommendedJobsAllowlist().mode === "everyone") return true
  const user = await getCurrentUser()
  return recommendedJobsAllowedFor(user?.id ?? null)
}
