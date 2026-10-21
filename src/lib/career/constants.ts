export const VERIFICATION_STATES = ["suggested", "user_verified", "rejected", "superseded"] as const
export type VerificationState = (typeof VERIFICATION_STATES)[number]

export const FACT_LABELS = {
  employment: "Employment",
  education: "Education",
  skill: "Skills",
  project: "Projects",
  accomplishment: "Accomplishments",
  certification: "Certifications",
} as const

export const VERIFICATION_LABELS: Record<VerificationState, string> = {
  suggested: "Suggested",
  user_verified: "Verified",
  rejected: "Rejected",
  superseded: "Superseded",
}

export const SOURCE_TEXT_LIMIT = 80_000
