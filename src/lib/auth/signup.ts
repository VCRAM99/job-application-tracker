export function isDuplicateSignup(
  user: { identities?: unknown[] | null } | null | undefined,
): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0
}
