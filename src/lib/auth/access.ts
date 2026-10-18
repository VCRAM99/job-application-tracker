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

export function isRecoveryProof(tokenHash: string, type: string): boolean {
  return tokenHash.trim().length > 0 && type === "recovery"
}
