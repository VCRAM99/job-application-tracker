export function recordsShareOwner(leftUserId: string, rightUserId: string): boolean {
  return leftUserId.length > 0 && leftUserId === rightUserId
}

export function applicationMatchesCompany(input: {
  applicationUserId: string
  companyUserId: string
  applicationCompanyId: string
  companyId: string
}): boolean {
  return (
    recordsShareOwner(input.applicationUserId, input.companyUserId) &&
    input.applicationCompanyId === input.companyId
  )
}
