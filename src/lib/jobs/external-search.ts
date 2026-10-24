export type ExternalSearchInput = {
  keywords: string
  location: string
  country: string
  workArrangement: string
}

/**
 * Builds a public search URL. The result is not an indexed job.
 * LinkedIn has no documented parameter that reliably excludes Easy Apply, so this link does not claim that filter.
 */
export function linkedInSearchUrl(input: ExternalSearchInput): string {
  const url = new URL("https://www.linkedin.com/jobs/search/")
  if (input.keywords.trim()) url.searchParams.set("keywords", input.keywords.trim())
  if (input.location.trim()) url.searchParams.set("location", input.location.trim())
  if (input.workArrangement === "remote") url.searchParams.set("f_WT", "2")
  if (input.workArrangement === "hybrid") url.searchParams.set("f_WT", "3")
  if (input.workArrangement === "onsite") url.searchParams.set("f_WT", "1")
  return url.toString()
}

export function indeedSearchUrl(input: ExternalSearchInput): string {
  const host = input.country === "CA" ? "https://ca.indeed.com/jobs" : "https://www.indeed.com/jobs"
  const url = new URL(host)
  if (input.keywords.trim()) url.searchParams.set("q", input.keywords.trim())
  if (input.location.trim()) url.searchParams.set("l", input.location.trim())
  if (input.workArrangement === "remote") url.searchParams.set("sc", "0kf:attr(DSQF7);")
  return url.toString()
}
