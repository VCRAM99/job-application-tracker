export const RECOVERY_COOKIE = "recovery_proof"

const TEN_MINUTES = 60 * 10

export function recoveryCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TEN_MINUTES,
  }
}
