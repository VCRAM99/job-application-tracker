export function isConfirmedAccount(
  user:
    | {
        email_confirmed_at?: string | null
        confirmed_at?: string | null
      }
    | null
    | undefined,
): boolean {
  if (!user) return false
  return Boolean(user.email_confirmed_at || user.confirmed_at)
}

export function unconfirmedLoginMessage(
  user:
    | {
        email_confirmed_at?: string | null
        confirmed_at?: string | null
      }
    | null
    | undefined,
): string | null {
  if (isConfirmedAccount(user)) return null
  return "Confirm your email before signing in. Check your inbox for the verification link."
}

export function isRecoveryProof(tokenHash: string, type: string): boolean {
  return tokenHash.trim().length > 0 && type === "recovery"
}
